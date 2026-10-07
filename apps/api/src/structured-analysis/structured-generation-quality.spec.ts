import { describe, expect, it } from 'vitest';
import { evaluateStructuredGeneration } from './structured-generation-quality';

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
