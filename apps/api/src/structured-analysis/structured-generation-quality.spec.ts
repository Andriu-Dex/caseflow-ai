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
});
