import { describe, expect, it } from 'vitest';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import {
  acceptanceResults,
  acceptanceSpec,
  deriveCriteria,
  type AcceptanceUseCase,
} from './acceptance';

const plan = {
  authentication: { required: true, roles: ['Administrador', 'Cajero'] },
  routes: [
    {
      path: '/sales',
      screenName: 'Ventas',
      screenLocalId: 'sales',
      roles: ['Administrador', 'Cajero'],
      actions: [
        { label: 'Registrar venta', endpoint: 'POST /sales' },
        { label: 'Anular', endpoint: 'POST /sales/:saleId/void' },
        { label: 'Ver detalle', navigation: { routePath: '/sales/[saleId]', idField: 'id' } },
        { label: 'Siguiente', interaction: 'PAGINATE_NEXT' },
        { label: 'Nuevo', operation: 'CREATE' },
        { label: 'Editar', operation: 'UPDATE' },
      ],
    },
    { path: '/sales/[saleId]', screenName: 'Detalle', screenLocalId: 'detail', actions: [] },
    {
      path: '/products',
      screenName: 'Productos',
      screenLocalId: 'products',
      roles: ['Administrador'],
      actions: [],
    },
  ],
} as unknown as ImplementationPlanContent;

const useCase = (code: string, patch: Partial<AcceptanceUseCase> = {}): AcceptanceUseCase => ({
  code,
  name: 'Registrar venta',
  primaryActor: 'cajero',
  preconditions: ['Hay una caja abierta.'],
  mainFlow: [
    { actor: 'Cajero', action: 'elige los productos' },
    { actor: 'Sistema', action: 'calcula el total' },
    { actor: 'Cajero', action: 'confirma la venta' },
  ],
  postconditions: ['La venta queda confirmada.'],
  alternativeFlows: ['Producto agotado'],
  requirementCodes: ['RF-010'],
  ...patch,
});

describe('acceptance criteria (ADR-025)', () => {
  it('derives one criterion per realized use case, with the actor role and the actions shown without a record', () => {
    const criteria = deriveCriteria(
      plan,
      [
        { localId: 'sales', relatedUseCaseCodes: ['CU-002'] },
        { localId: 'detail', relatedUseCaseCodes: ['CU-002'] },
      ],
      [useCase('CU-002'), useCase('CU-009', { name: 'Sin pantalla' })],
    );
    expect(criteria).toEqual([
      {
        key: 'CA-CU-002',
        useCaseCode: 'CU-002',
        useCaseName: 'Registrar venta',
        given: 'Hay una caja abierta; y cajero inició sesión',
        when: 'cajero elige los productos; confirma la venta',
        then: 'La venta queda confirmada',
        alternativeFlows: ['Producto agotado'],
        requirementCodes: ['RF-010'],
        role: 'Cajero',
        // The detail screen needs a record; row actions and paging are left out.
        screens: [{ path: '/sales', screenName: 'Ventas', actions: ['Registrar venta', 'Nuevo'] }],
      },
    ]);
  });

  it('uses the screen role when no role matches the actor, and only screens it may open', () => {
    const [criterion] = deriveCriteria(
      plan,
      [
        { localId: 'products', relatedUseCaseCodes: ['CU-003'] },
        { localId: 'sales', relatedUseCaseCodes: ['CU-003'] },
      ],
      [useCase('CU-003', { primaryActor: 'Gerente' })],
    );
    expect(criterion!.role).toBe('Administrador');
    expect(criterion!.screens.map((s) => s.path)).toEqual(['/sales', '/products']);
  });

  it('writes a test per criterion and reads each result from the runner report', () => {
    const spec = acceptanceSpec(
      deriveCriteria(
        plan,
        [{ localId: 'sales', relatedUseCaseCodes: ['CU-002'] }],
        [useCase('CU-002')],
      ),
    );
    expect(spec).toContain('"title": "[CA-CU-002] Registrar venta"');
    expect(spec).toContain('toBeVisible()');
    const output = [
      '  ✓  1 [chromium] › acceptance.spec.ts:20:3 › [CA-CU-002] Registrar venta (3.1s)',
      '  ✘  2 [chromium] › acceptance.spec.ts:20:3 › [CA-CU-004] Anular venta (2.0s)',
    ].join('\n');
    expect(
      Object.fromEntries(acceptanceResults(output, ['CA-CU-002', 'CA-CU-004', 'CA-CU-005'])),
    ).toEqual({
      'CA-CU-002': { passed: true, message: null },
      'CA-CU-004': { passed: false, message: 'La prueba de aceptación falló.' },
      'CA-CU-005': { passed: false, message: 'La prueba de aceptación no llegó a ejecutarse.' },
    });
  });
});
