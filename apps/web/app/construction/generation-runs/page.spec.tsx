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
  sandboxRuns: vi.fn(),
  validate: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  api: {
    structuredAnalysis: { list: (...args: unknown[]) => mocks.listPlans(...args) },
    generationRuns: {
      list: (...args: unknown[]) => mocks.listRuns(...args),
      start: (...args: unknown[]) => mocks.start(...args),
      files: (...args: unknown[]) => mocks.files(...args),
      file: (...args: unknown[]) => mocks.file(...args),
      sandboxRuns: (...args: unknown[]) => mocks.sandboxRuns(...args),
      validate: (...args: unknown[]) => mocks.validate(...args),
      snapshotArchiveUrl: (p: string, s: string) => `/api/${p}/${s}.zip`,
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
  mocks.sandboxRuns.mockResolvedValue({ items: [] });
  mocks.validate.mockResolvedValue({});
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

  it('starts the sandbox validation of a generated run', async () => {
    render(<GenerationRunsPage />, { wrapper: TestProviders });
    await userEvent.click(await screen.findByRole('button', { name: 'Validar proyecto' }));
    await waitFor(() => expect(mocks.validate).toHaveBeenCalledWith('p1', 'run-1'));
  });

  it('shows failed stage evidence and repair rounds without a download', async () => {
    const stage = (name: string, passed: boolean) => ({
      stage: name,
      passed,
      exitCode: passed ? 0 : 2,
      timedOut: false,
      durationMs: 1,
      output: passed ? 'ok' : 'error TS2304',
    });
    mocks.sandboxRuns.mockResolvedValue({
      items: [
        {
          id: 's1',
          attemptNumber: 1,
          status: 'VALIDATION_FAILED',
          currentStage: null,
          errorMessage: 'La etapa TYPECHECK falló.',
          stages: [stage('INSTALL', true), stage('TYPECHECK', false)],
          repair: {
            roundNumber: 1,
            status: 'NO_PATCH',
            explanation: 'Sin IA.',
            patchedPaths: [],
            findings: ['RF-001 es ambiguo.'],
          },
          snapshotId: null,
        },
      ],
    });
    render(<GenerationRunsPage />, { wrapper: TestProviders });
    expect(await screen.findByText(/Intento 1: Validación fallida/)).toBeInTheDocument();
    expect(screen.getByText('error TS2304')).toBeInTheDocument();
    expect(screen.getByText(/Hallazgo: RF-001 es ambiguo/)).toBeInTheDocument();
    expect(screen.queryByText('Descargar ZIP')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Validar proyecto/ })).not.toBeInTheDocument();
  });

  it('renders executive header banner', async () => {
    render(<GenerationRunsPage />, { wrapper: TestProviders });
    expect(await screen.findByText('Generación de Código Fuente y Sandbox')).toBeInTheDocument();
    expect(screen.getAllByText(/Fase de Construcción · Paso 5 de 5/i).length).toBeGreaterThan(0);
  });

  it('filters generated files with search input and copies code', async () => {
    const user = userEvent.setup();
    // Mock navigator.clipboard
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    render(<GenerationRunsPage />, { wrapper: TestProviders });

    await user.click(await screen.findByRole('button', { name: 'Ver archivos' }));
    expect(await screen.findByRole('button', { name: /main\.ts/ })).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Filtrar archivos');
    await user.type(searchInput, 'controller');

    expect(screen.getByText('No hay archivos que coincidan con el filtro.')).toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, 'main');
    expect(screen.getByRole('button', { name: /main\.ts/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /main\.ts/ }));
    expect(await screen.findByText('bootstrap();')).toBeInTheDocument();

    const copyBtn = screen.getByRole('button', { name: /Copiar código/i });
    await user.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith('bootstrap();');
  });

  it('disables the generate button and shows active progress when a generation is in progress', async () => {
    mocks.listRuns.mockResolvedValue({
      items: [
        {
          id: 'run-active',
          status: 'GENERATING',
          fileCount: 0,
          targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
          targetTemplateVersion: 1,
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          errorMessage: null,
          warnings: [],
        },
      ],
    });

    render(<GenerationRunsPage />, { wrapper: TestProviders });

    // The button must be disabled and say "Generación en curso…"
    const button = await screen.findByRole('button', { name: /Generación en curso…/i });
    expect(button).toBeDisabled();

    // The warning message must be shown
    expect(
      screen.getByText(/Ya hay una generación de código en proceso para este proyecto/i),
    ).toBeInTheDocument();

    // The active progress component must render with its title and phase indicators
    expect(screen.getByText(/Construyendo Modular Monolith TypeScript/i)).toBeInTheDocument();
    expect(screen.getByText(/Backend NestJS/i)).toBeInTheDocument();
  });
});
