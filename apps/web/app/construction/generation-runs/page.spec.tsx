import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationRunsPage from './page';
import { TestProviders } from '../../../lib/test-utils';

const mocks = vi.hoisted(() => ({
  listPlans: vi.fn(),
  listRuns: vi.fn(),
  start: vi.fn(),
  files: vi.fn(),
  file: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  api: {
    structuredAnalysis: { list: (...args: unknown[]) => mocks.listPlans(...args) },
    generationRuns: {
      list: (...args: unknown[]) => mocks.listRuns(...args),
      start: (...args: unknown[]) => mocks.start(...args),
      files: (...args: unknown[]) => mocks.files(...args),
      file: (...args: unknown[]) => mocks.file(...args),
    },
    readiness: { get: vi.fn(async () => ({ stages: [] })) },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const run = {
  id: 'run-1',
  status: 'GENERATED',
  fileCount: 1,
  targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
  targetTemplateVersion: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  errorMessage: null,
  warnings: ['La acción «Confirmar pedido» quedó sin implementar (responde 501).'],
};

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  mocks.listPlans.mockResolvedValue({
    items: [
      {
        code: 'PI-001',
        title: 'Plan',
        version: { id: 'pv1', versionNumber: 1, status: 'APPROVED' },
      },
      {
        code: 'PI-002',
        title: 'Borrador',
        version: { id: 'pv2', versionNumber: 1, status: 'DRAFT' },
      },
    ],
  });
  mocks.listRuns.mockResolvedValue({ items: [run] });
  mocks.start.mockResolvedValue({ ...run, id: 'run-2', status: 'QUEUED' });
  mocks.files.mockResolvedValue({ items: [{ id: 'f1', path: 'apps/api/src/main.ts' }] });
  mocks.file.mockResolvedValue({
    path: 'apps/api/src/main.ts',
    content: 'bootstrap();',
    traceLinks: [
      {
        sourceArtifactVersionId: 'pv1',
        code: 'PI-001',
        versionNumber: 1,
        planElement: 'project',
        linkType: 'CONFIGURES',
      },
    ],
  });
});

describe('GenerationRunsPage', () => {
  it('starts a run only from an approved plan', async () => {
    render(<GenerationRunsPage />, { wrapper: TestProviders });
    expect(await screen.findByRole('option', { name: /PI-001/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /PI-002/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Generar proyecto' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('p1', 'pv1'));
  });

  it('shows warnings, files and their traceability', async () => {
    render(<GenerationRunsPage />, { wrapper: TestProviders });
    expect(await screen.findByText(/Confirmar pedido/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver archivos' }));
    await userEvent.click(await screen.findByRole('button', { name: /main\.ts/ }));
    expect(await screen.findByText('bootstrap();')).toBeInTheDocument();
    expect(screen.getByText(/Configura PI-001 v1/)).toBeInTheDocument();
  });
});
