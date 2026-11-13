import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  implementationPlanContentSchema,
  type GenerationRunResponse,
} from '@caseflow-ai/contracts';
import { TestProviders } from '../../../lib/test-utils';
import { WorkingCopySummary } from './working-copy-summary';
const mocks = vi.hoisted(() => ({ files: vi.fn(), file: vi.fn() }));
vi.mock('../../../lib/api', () => ({
  api: {
    generationRuns: {
      files: (...args: unknown[]) => mocks.files(...args),
      file: (...args: unknown[]) => mocks.file(...args),
    },
  },
  restoreSession: vi.fn(),
}));
const versionId = '11111111-1111-4111-8111-111111111111',
  baselineId = '22222222-2222-4222-8222-222222222222';
const run: GenerationRunResponse = {
  id: '33333333-3333-4333-8333-333333333333',
  projectId: '44444444-4444-4444-8444-444444444444',
  implementationPlanVersionId: versionId,
  designBaselineId: baselineId,
  status: 'WORKING_COPY',
  targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
  targetTemplateVersion: 2,
  errorMessage: null,
  warnings: [],
  fileCount: 20,
  createdByUserId: '55555555-5555-4555-8555-555555555555',
  createdAt: '2026-11-08T00:00:00Z',
  startedAt: null,
  finishedAt: null,
  archivedAt: null,
};
const manifest = {
  formatVersion: 1,
  officialDelivery: false,
  implementationPlanVersionId: versionId,
  designBaselineId: baselineId,
  implementedEndpoints: ['POST /orders/confirm'],
  pendingEndpoints: ['GET /reports/sales'],
};
const plan = implementationPlanContentSchema.parse({
  designBaselineId: baselineId,
  authentication: { required: false },
  modules: [{ localId: 'reports', name: 'Reports', description: 'Informes' }],
  entities: [
    {
      localId: 'report',
      name: 'Report',
      moduleLocalId: 'reports',
      fields: [{ name: 'name', type: 'STRING' }],
      operations: ['LIST'],
    },
  ],
  customEndpoints: [
    {
      moduleLocalId: 'reports',
      method: 'GET',
      path: '/reports/sales',
      summary: 'Consultar ventas',
    },
  ],
  routes: [
    {
      path: '/reports',
      screenName: 'Informes',
      moduleLocalId: 'reports',
      kind: 'CUSTOM',
      actions: [{ label: 'Consultar ventas', endpoint: 'GET /reports/sales' }],
    },
  ],
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.files.mockResolvedValue({ items: [{ id: 'manifest', path: 'docs/working-copy.json' }] });
  mocks.file.mockResolvedValue({ content: JSON.stringify(manifest) });
});
describe('persisted working copy summary', () => {
  it('shows canonical counts and human descriptions with the pending list collapsed', async () => {
    render(<WorkingCopySummary projectId={run.projectId} run={run} plan={plan} />, {
      wrapper: TestProviders,
    });
    expect(await screen.findByText('1 acción con implementación · 1 pendiente')).toBeVisible();
    const disclosure = screen.getByText('Pendientes por funcionalidad (1)');
    expect(disclosure.closest('details')).not.toHaveAttribute('open');
    await userEvent.click(disclosure);
    expect(screen.getByText('Informes (1)')).toBeVisible();
    expect(screen.getByText('Consultar ventas')).toBeVisible();
    expect(screen.queryByText('GET /reports/sales')).not.toBeInTheDocument();
    expect(mocks.file).toHaveBeenCalledWith(run.projectId, run.id, 'manifest');
  });
  it.each(['missing', 'malformed', 'overlap', 'wrong-plan', 'wrong-design'])(
    'does not invent counts for a %s manifest',
    async (kind) => {
      if (kind === 'missing') mocks.files.mockResolvedValue({ items: [] });
      else
        mocks.file.mockResolvedValue({
          content:
            kind === 'malformed'
              ? '{invalid'
              : JSON.stringify({
                  ...manifest,
                  ...(kind === 'overlap'
                    ? { pendingEndpoints: manifest.implementedEndpoints }
                    : {}),
                  ...(kind === 'wrong-plan'
                    ? { implementationPlanVersionId: '66666666-6666-4666-8666-666666666666' }
                    : {}),
                  ...(kind === 'wrong-design'
                    ? { designBaselineId: '66666666-6666-4666-8666-666666666666' }
                    : {}),
                }),
        });
      render(<WorkingCopySummary projectId={run.projectId} run={run} />, {
        wrapper: TestProviders,
      });
      expect(await screen.findByText(/Resumen de acciones no disponible/)).toBeVisible();
      expect(screen.queryByText(/acciones con implementación/)).not.toBeInTheDocument();
      if (kind === 'missing') await waitFor(() => expect(mocks.file).not.toHaveBeenCalled());
    },
  );
});
