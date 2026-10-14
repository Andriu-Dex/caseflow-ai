import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RequirementsPage from './page';
import { TestProviders } from '../../lib/test-utils';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  transition: vi.fn(),
  archive: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('../../lib/api', () => ({
  api: {
    requirements: {
      latestGeneration: vi.fn(async () => ({ job: null })),
      startGeneration: vi.fn(),
      generation: vi.fn(),
      list: (...args: unknown[]) => mocks.list(...args),
      transition: (...args: unknown[]) => mocks.transition(...args),
      qualityReport: vi.fn(async () => ({
        issues: [
          {
            requirementId: 'r2',
            code: 'RF-002',
            rule: 'PLACEHOLDER_TEXT',
            message: 'La descripción contiene texto provisional.',
          },
        ],
      })),
      contextCoverage: vi.fn(async () => ({
        context: { artifactId: ids.context, versionId: ids.context, versionNumber: 1, code: 'CTX' },
        items: [
          { ...need('N-1', 'Registrar pedidos'), mandatory: true, coveredBy: ['RF-001'] },
          { ...need('N-2', 'Consultar pedidos'), mandatory: true, coveredBy: [] },
        ],
        withoutOrigin: [{ id: 'r2', code: 'RF-002' }],
      })),
      exportUrl: vi.fn(),
    },
    artifacts: { archive: (...args: unknown[]) => mocks.archive(...args) },
    context: { getCurrent: vi.fn(async () => ({ version: { id: 'ctx', status: 'APPROVED' } })) },
    staleness: { get: vi.fn(async () => ({ projectId: 'p1', generatedAt: '', entries: [] })) },
    readiness: { get: vi.fn(async () => ({ stages: [] })) },
  },
  ApiError: class ApiError extends Error {},
  downloadFile: vi.fn(),
  openFileInNewTab: vi.fn(),
  restoreSession: vi.fn(),
}));

const ids = {
  context: '00000000-0000-4000-8000-000000000001',
  n1: '00000000-0000-4000-8000-000000000002',
  n2: '00000000-0000-4000-8000-000000000003',
};
const need = (code: string, description: string) => ({
  id: code === 'N-1' ? ids.n1 : ids.n2,
  kind: 'NEED' as const,
  code,
  description,
  contextVersionId: ids.context,
});
const requirement = (
  id: string,
  code: string,
  name: string,
  patch: {
    type?: 'FUNCTIONAL' | 'NON_FUNCTIONAL';
    status?: string;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    origin?: unknown;
  },
) => ({
  id,
  projectId: 'p1',
  code,
  createdAt: new Date().toISOString(),
  version: {
    id: `${id}-v`,
    versionNumber: 1,
    status: patch.status ?? 'DRAFT',
    origin: 'MANUAL',
    createdAt: new Date().toISOString(),
  },
  requirement: {
    requirementType: patch.type ?? 'FUNCTIONAL',
    name,
    description: `Descripción de ${name}`,
    priority: patch.priority ?? 'MEDIUM',
    actors: ['Cliente'],
    preconditions: ['Tener sesión'],
    postconditions: [],
    dependencyArtifactIds: [],
    sourceContextVersionId: null,
    aiRunId: null,
    origin: patch.origin ?? null,
  },
});

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  mocks.list.mockResolvedValue({
    items: [
      requirement('r1', 'RF-001', 'Registrar pedido', {
        status: 'APPROVED',
        priority: 'HIGH',
        origin: {
          kind: 'CONTEXT',
          justification: null,
          contextItems: [need('N-1', 'Registrar pedidos')],
        },
      }),
      requirement('r2', 'RF-002', 'Exportar a Excel', { status: 'GENERATED' }),
      requirement('r3', 'RNF-001', 'Responder rápido', {
        type: 'NON_FUNCTIONAL',
        priority: 'LOW',
        origin: { kind: 'USER_DECISION', justification: 'Lo pidió el cliente.', contextItems: [] },
      }),
    ],
  });
  mocks.transition.mockResolvedValue({});
  mocks.archive.mockResolvedValue({});
});

const renderPage = () =>
  render(
    <TestProviders>
      <RequirementsPage />
    </TestProviders>,
  );

describe('Requirements list', () => {
  it('summarises the requirements and how they cover the context', async () => {
    renderPage();
    const summary = await screen.findByRole('group', { name: 'Resumen de requisitos' });
    expect(within(summary).getByText('Funcionales').parentElement).toHaveTextContent('2');
    expect(within(summary).getByText('Aprobados').parentElement).toHaveTextContent('1 de 3');
    expect(await within(summary).findByText(/1 sin origen/)).toBeInTheDocument();
    expect(screen.getByText(/cubren 1 de 2 necesidades/)).toBeInTheDocument();
  });

  it('groups the rows by type and narrows them by search and filters', async () => {
    const user = userEvent.setup();
    renderPage();
    const functional = await screen.findByRole('region', { name: 'Funcionales' });
    expect(within(functional).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'No funcionales' })).toHaveTextContent('RNF-001');

    await user.type(screen.getByLabelText('Buscar requisitos'), 'excel');
    expect(screen.getByText('Exportar a Excel')).toBeInTheDocument();
    expect(screen.queryByText('Registrar pedido')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await user.selectOptions(screen.getByLabelText('Estado'), 'APPROVED');
    expect(screen.getByText('Registrar pedido')).toBeInTheDocument();
    expect(screen.queryByText('Exportar a Excel')).not.toBeInTheDocument();
  });

  it('opens a row to show its origin and everything else', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /^RF-001/ }));
    expect(screen.getByText('Descripción de Registrar pedido')).toBeInTheDocument();
    expect(screen.getByText('Registrar pedidos')).toBeInTheDocument();
    expect(screen.getByText('Tener sesión')).toBeInTheDocument();

    // A requirement without origin says so and offers to complete it.
    await user.click(screen.getByRole('button', { name: /^RF-002/ }));
    expect(screen.getByRole('button', { name: 'Indicar el origen' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1 sugerencia de calidad' })).toBeInTheDocument();
  });

  it('approves a pending requirement and archives one after confirming', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findByText('Exportar a Excel')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Aprobar' }));
    await waitFor(() =>
      expect(mocks.transition).toHaveBeenLastCalledWith('p1', 'r2', 'r2-v', 'APPROVED'),
    );

    await user.click(within(row).getByRole('button', { name: 'Más acciones de RF-002' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archivar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Archivar requisito' });
    await user.click(within(dialog).getByRole('button', { name: 'Archivar' }));
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith('p1', 'r2'));
  });

  // The row itself opens; its menu no longer repeats it as "Ver detalle".
  it('opens a row by clicking it, not from its menu', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findByText('Exportar a Excel')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Más acciones de RF-002' }));
    await screen.findByRole('menuitem', { name: 'Editar' });
    expect(screen.queryByRole('menuitem', { name: 'Ver detalle' })).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(within(row).getByText('Exportar a Excel'));
    expect(screen.getByText('Descripción de Exportar a Excel')).toBeInTheDocument();
  });

  // DEC-138: a long list is paged, functional requirements first.
  it('pages a long list and starts again on the first page when filtering', async () => {
    mocks.list.mockResolvedValue({
      items: [
        ...Array.from({ length: 20 }, (_, i) =>
          requirement(`f${i}`, `RF-${String(i + 1).padStart(3, '0')}`, `Funcional ${i + 1}`, {}),
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          requirement(`n${i}`, `RNF-${String(i + 1).padStart(3, '0')}`, `Calidad ${i + 1}`, {
            type: 'NON_FUNCTIONAL',
          }),
        ),
      ],
    });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Funcional 1')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getByText('Calidad 5')).toBeInTheDocument();
    expect(screen.queryByText('Calidad 6')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('Calidad 6')).toBeInTheDocument();
    expect(screen.queryByText('Funcional 1')).toBeNull();
    await user.selectOptions(screen.getByLabelText('Tipo'), 'NON_FUNCTIONAL');
    expect(screen.getByText('Calidad 1')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginación de requisitos' })).toBeNull();
    expect(screen.getByRole('option', { name: 'No funcionales (10)' })).toBeInTheDocument();
  });
});
