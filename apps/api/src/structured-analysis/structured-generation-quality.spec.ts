import { describe, expect, it } from 'vitest';
import {
  evaluateStructuredGeneration,
  withUseCaseProvenance,
} from './structured-generation-quality';

describe('structured generation provenance checks', () => {
  it('accepts exact selected references and flags uncovered sources', () => {
    const findings = evaluateStructuredGeneration(
      'NAVIGATION_TREE',
      {
        nodes: [
          {
            localId: 'orders',
            label: 'Pedidos',
            viewName: 'Pedidos',
            kind: 'LIST',
            relatedUseCaseCodes: ['CU-001'],
            relatedSourceCodes: ['CU-001'],
          },
        ],
      },
      [
        { code: 'CU-001', type: 'USE_CASE' },
        { code: 'RF-002', type: 'REQUIREMENT' },
      ],
    );
    expect(findings).toEqual([
      expect.objectContaining({
        code: 'UNCOVERED_SOURCE',
        message: expect.stringContaining('RF-002'),
      }),
    ]);
  });

  it('says once, not once per source, that many sources are not cited', () => {
    const sources = Array.from({ length: 40 }, (_, i) => ({
      code: `RF-${String(i + 1).padStart(3, '0')}`,
      type: 'REQUIREMENT',
    }));
    const findings = evaluateStructuredGeneration(
      'SOFTWARE_ARCHITECTURE',
      {
        style: 'Modular',
        components: [{ localId: 'api', name: 'API', relatedSourceCodes: ['RF-001'] }],
      },
      sources,
    ).filter((finding) => finding.code === 'UNCOVERED_SOURCE');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toBe(
      '39 de las 40 fuentes no aparecen citadas en la propuesta (RF-002, RF-003, RF-004, RF-005, RF-006 y 34 más). Revise si debería reflejar algo de ellas.',
    );
  });

  it('does not ask a class diagram or a conceptual model to cite every requirement or use case', () => {
    const sources = [
      { code: 'RF-001', type: 'REQUIREMENT', requirementType: 'FUNCTIONAL' },
      { code: 'RF-002', type: 'REQUIREMENT', requirementType: 'FUNCTIONAL' },
      { code: 'CU-001', type: 'USE_CASE' },
    ];
    const findings = evaluateStructuredGeneration(
      'CLASS_DIAGRAM',
      { classes: [{ localId: 'order', name: 'Pedido', relatedSourceCodes: ['RF-001'] }] },
      sources,
    );
    expect(findings.map((finding) => finding.code)).not.toContain('UNCOVERED_SOURCE');
  });

  it('still expects a class diagram to start from the data model it is built on', () => {
    const findings = evaluateStructuredGeneration(
      'CLASS_DIAGRAM',
      { classes: [{ localId: 'order', name: 'Pedido', relatedSourceCodes: ['RF-001'] }] },
      [
        { code: 'RF-001', type: 'REQUIREMENT', requirementType: 'FUNCTIONAL' },
        { code: 'RNF-001', type: 'REQUIREMENT', requirementType: 'NON_FUNCTIONAL' },
        { code: 'MD-001', type: 'DATA_MODEL' },
      ],
    );
    expect(findings).toEqual([
      expect.objectContaining({
        code: 'UNCOVERED_SOURCE',
        message:
          'Ningún elemento de la propuesta proviene de MD-001. Revise si debería incluir algo de esa fuente.',
      }),
    ]);
  });

  it('rejects invented source and use-case codes', () => {
    const findings = evaluateStructuredGeneration(
      'SOFTWARE_ARCHITECTURE',
      {
        style: 'Modular',
        components: [{ localId: 'api', name: 'API', relatedSourceCodes: ['RF-999'] }],
      },
      [{ code: 'RF-001', type: 'REQUIREMENT' }],
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ severity: 'ERROR', code: 'UNKNOWN_SOURCE' }),
    );
  });

  it('checks selected navigation nodes and use cases in UI blueprints', () => {
    const findings = evaluateStructuredGeneration(
      'UI_BLUEPRINT',
      {
        screens: [
          {
            localId: 'checkout',
            name: 'Pago',
            purpose: 'Confirmar el pedido',
            relatedSourceCodes: ['NAV-001'],
            relatedUseCaseCodes: ['CU-999'],
            navigationNodeLocalId: 'missing',
          },
        ],
      },
      [
        {
          code: 'NAV-001',
          type: 'NAVIGATION_TREE',
          content: {
            nodes: [{ localId: 'orders', label: 'Pedidos', viewName: 'Pedidos', kind: 'LIST' }],
          },
        },
      ],
    );
    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        'UNKNOWN_USE_CASE',
        'UNKNOWN_NAVIGATION_NODE',
        'UNCOVERED_NAVIGATION_NODE',
      ]),
    );
  });

  it('warns when system nodes omit explicit provenance', () => {
    const findings = evaluateStructuredGeneration(
      'SYSTEM_ARCHITECTURE',
      { boundary: 'Aplicación', nodes: [{ localId: 'server', name: 'Servidor', kind: 'RUNTIME' }] },
      [{ code: 'RF-001', type: 'REQUIREMENT' }],
    );
    expect(findings.map((finding) => finding.code)).toEqual([
      'MISSING_PROVENANCE',
      'UNCOVERED_SOURCE',
    ]);
  });

  it('checks a generation plan cites only selected requirements, use cases and sources', () => {
    const plan = (module: Record<string, unknown>) => ({
      summary: 'Sistema de pedidos.',
      modules: [{ localId: 'orders', name: 'Pedidos', purpose: 'Gestionar pedidos', ...module }],
      authentication: { required: true },
    });
    const sources = [
      { code: 'RF-001', type: 'REQUIREMENT' },
      { code: 'CU-001', type: 'USE_CASE' },
    ];
    expect(
      evaluateStructuredGeneration(
        'GENERATION_PLAN',
        plan({
          relatedRequirementCodes: ['RF-001'],
          relatedUseCaseCodes: ['CU-001'],
          relatedSourceCodes: ['RF-001', 'CU-001'],
        }),
        sources,
      ),
    ).toEqual([]);
    const invented = evaluateStructuredGeneration(
      'GENERATION_PLAN',
      plan({
        relatedRequirementCodes: ['RF-404'],
        relatedUseCaseCodes: ['CU-404'],
        relatedSourceCodes: ['RF-001'],
      }),
      sources,
    );
    expect(invented.filter((f) => f.severity === 'ERROR').map((f) => f.code)).toEqual([
      'UNKNOWN_USE_CASE',
      'UNKNOWN_REQUIREMENT',
    ]);
  });

  it('flags conceptual entities without provenance or citing unselected sources', () => {
    const findings = evaluateStructuredGeneration(
      'CONCEPTUAL_DOMAIN_MODEL',
      {
        entities: [
          {
            localId: 'order',
            name: 'Pedido',
            description: 'Solicitud de compra.',
            attributes: [{ name: 'fecha' }],
            relatedSourceCodes: ['PG-001'],
          },
          {
            localId: 'client',
            name: 'Cliente',
            description: 'Quien compra.',
            attributes: [{ name: 'nombre' }],
          },
          {
            localId: 'x',
            name: 'Inventada',
            description: 'Sin fuente real.',
            attributes: [{ name: 'a' }],
            relatedSourceCodes: ['PG-999'],
          },
        ],
      },
      [{ code: 'PG-001', type: 'GENERATION_PLAN' }],
    );
    expect(findings.map((f) => f.code)).toEqual(['MISSING_PROVENANCE', 'UNKNOWN_SOURCE']);
  });

  it('checks the provenance of implementation plan modules, entities, endpoints and routes', () => {
    const findings = evaluateStructuredGeneration(
      'IMPLEMENTATION_PLAN',
      {
        designBaselineId: '11111111-1111-4111-8111-111111111111',
        authentication: { required: false },
        modules: [
          {
            localId: 'sales',
            name: 'Sales',
            description: 'Pedidos',
            relatedSourceCodes: ['PG-001'],
          },
        ],
        entities: [
          {
            localId: 'order',
            name: 'Order',
            moduleLocalId: 'sales',
            fields: [{ name: 'total', type: 'DECIMAL' }],
            relatedSourceCodes: ['MC-999'],
          },
        ],
        routes: [{ path: '/orders', screenName: 'Pedidos', moduleLocalId: 'sales', kind: 'LIST' }],
      },
      [{ code: 'PG-001', type: 'GENERATION_PLAN' }],
    );
    expect(findings.map((f) => `${f.severity}:${f.code}`)).toEqual([
      'ERROR:UNKNOWN_SOURCE',
      'WARNING:MISSING_PROVENANCE',
    ]);
  });
});

describe('class diagram coverage (DEC-121)', () => {
  const dataModel = {
    code: 'MD-001',
    type: 'DATA_MODEL',
    content: {
      entities: [
        { name: 'Cliente', attributes: [{ name: 'correo' }, { name: 'nombre' }] },
        { name: 'Pedido', attributes: [{ name: 'total' }] },
      ],
    },
  };
  const content = {
    classes: [
      {
        localId: 'cliente',
        name: 'Cliente',
        dataModelEntityName: 'cliente',
        attributes: [{ name: 'Correo', type: 'string' }],
        relatedSourceCodes: ['MD-001'],
      },
    ],
  };

  it('reports missing classes and attributes as errors in strict projects', () => {
    const gaps = evaluateStructuredGeneration('CLASS_DIAGRAM', content, [dataModel]).filter(
      (f) => f.code === 'COVERAGE_GAP',
    );
    expect(gaps.map((f) => f.severity)).toEqual(['ERROR', 'ERROR']);
    expect(gaps.map((f) => f.message)).toEqual([
      expect.stringContaining('«nombre»'),
      expect.stringContaining('«Pedido»'),
    ]);
  });

  it('downgrades gaps to warnings in projects without mandatory coherence', () => {
    const gaps = evaluateStructuredGeneration('CLASS_DIAGRAM', content, [dataModel], {
      strict: false,
    }).filter((f) => f.code === 'COVERAGE_GAP');
    expect(gaps).toHaveLength(2);
    expect(gaps.every((f) => f.severity === 'WARNING')).toBe(true);
  });
});

describe('references by identifier across stages (DEC-121)', () => {
  const classDiagram = {
    code: 'DC-001',
    type: 'CLASS_DIAGRAM',
    content: { classes: [{ localId: 'order', name: 'Pedido' }] },
  };
  const blueprint = {
    code: 'UI-001',
    type: 'UI_BLUEPRINT',
    content: {
      screens: [
        {
          localId: 'orders',
          name: 'Pedidos',
          purpose: 'Gestionar pedidos',
          primaryActions: ['Crear pedido'],
          secondaryActions: ['Exportar'],
        },
      ],
    },
  };
  const plan = (patch: { classLocalId: string; screenLocalId: string; label: string }) => ({
    designBaselineId: '00000000-0000-4000-8000-000000000000',
    authentication: { required: false },
    modules: [{ localId: 'sales', name: 'Sales', description: 'Ventas' }],
    entities: [
      {
        localId: 'e',
        name: 'Order',
        moduleLocalId: 'sales',
        classLocalId: patch.classLocalId,
        fields: [{ name: 'total', type: 'DECIMAL' }],
        operations: ['CREATE'],
      },
    ],
    routes: [
      {
        path: '/orders',
        screenName: 'Pedidos',
        screenLocalId: patch.screenLocalId,
        moduleLocalId: 'sales',
        kind: 'LIST',
        entityLocalId: 'e',
        actions: [{ label: patch.label, operation: 'CREATE' }],
      },
    ],
  });
  const errors = (content: unknown) =>
    evaluateStructuredGeneration('IMPLEMENTATION_PLAN', content, [classDiagram, blueprint])
      .filter((f) => f.severity === 'ERROR' && f.code !== 'COVERAGE_GAP')
      .map((f) => f.code);

  it('accepts entities, routes and actions that point at the selected design', () => {
    expect(
      errors(plan({ classLocalId: 'order', screenLocalId: 'orders', label: 'Exportar' })),
    ).toEqual([]);
  });

  it('rejects unknown classes, screens and screen actions', () => {
    expect(
      errors(plan({ classLocalId: 'ghost', screenLocalId: 'orders', label: 'Borrar' })),
    ).toEqual(['UNKNOWN_CLASS', 'UNKNOWN_SCREEN_ACTION']);
    expect(
      errors(plan({ classLocalId: 'order', screenLocalId: 'ghost', label: 'Crear pedido' })),
    ).toEqual(['UNKNOWN_SCREEN']);
  });

  it('checks the class each conceptual entity refines', () => {
    const findings = evaluateStructuredGeneration(
      'CONCEPTUAL_DOMAIN_MODEL',
      {
        entities: [
          {
            localId: 'p',
            name: 'Pedido',
            description: 'Compra',
            classLocalId: 'ghost',
            attributes: [{ name: 'total' }],
          },
        ],
      },
      [classDiagram],
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ severity: 'ERROR', code: 'UNKNOWN_CLASS' }),
    );
  });
});

describe('withUseCaseProvenance', () => {
  it('names the related use cases among the justifying sources, once, and leaves the rest alone', () => {
    const tree = withUseCaseProvenance('NAVIGATION_TREE', {
      nodes: [
        {
          localId: 'a',
          relatedUseCaseCodes: ['CU-001', 'CU-002'],
          relatedSourceCodes: ['CU-001', 'RF-001'],
        },
        { localId: 'b', relatedUseCaseCodes: [] },
      ],
    });
    expect(tree.nodes[0]!.relatedSourceCodes).toEqual(['CU-001', 'RF-001', 'CU-002']);
    expect(tree.nodes[1]).toEqual({ localId: 'b', relatedUseCaseCodes: [] });
    const blueprint = withUseCaseProvenance('UI_BLUEPRINT', {
      screens: [{ localId: 's', relatedUseCaseCodes: ['CU-003'] }],
    });
    expect((blueprint.screens[0] as { relatedSourceCodes?: string[] }).relatedSourceCodes).toEqual([
      'CU-003',
    ]);
    const other = { modules: [] };
    expect(withUseCaseProvenance('GENERATION_PLAN', other)).toBe(other);
  });

  it('removes the warning the provenance check raised for such a node', () => {
    const content = {
      nodes: [
        {
          localId: 'a',
          label: 'Pedidos',
          viewName: 'Pedidos',
          kind: 'LIST',
          relatedUseCaseCodes: ['CU-001'],
          relatedSourceCodes: ['RF-001'],
        },
      ],
    };
    const sources = [
      { code: 'RF-001', type: 'REQUIREMENT' },
      { code: 'CU-001', type: 'USE_CASE' },
    ];
    const codes = (value: unknown) =>
      evaluateStructuredGeneration('NAVIGATION_TREE', value, sources).map((f) => f.code);
    expect(codes(content)).toContain('MISSING_USE_CASE_PROVENANCE');
    expect(codes(withUseCaseProvenance('NAVIGATION_TREE', content))).not.toContain(
      'MISSING_USE_CASE_PROVENANCE',
    );
  });
});
