import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UseCasesPage from './page';
import { TestProviders } from '../../lib/test-utils';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  start: vi.fn(),
  latest: vi.fn(),
  generation: vi.fn(),
  bulk: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('../../lib/api', () => ({
  api: {
    useCases: {
      list: (...args: unknown[]) => mocks.list(...args),
      startGeneration: (...args: unknown[]) => mocks.start(...args),
      latestGeneration: (...args: unknown[]) => mocks.latest(...args),
      generation: (...args: unknown[]) => mocks.generation(...args),
      bulk: (...args: unknown[]) => mocks.bulk(...args),
    },
    requirements: { list: vi.fn(async () => ({ items: requirements })) },
    useCaseDiagrams: { list: vi.fn(async () => ({ items: [] })) },
    staleness: { get: vi.fn(async () => ({ projectId: 'p1', generatedAt: '', entries: [] })) },
    readiness: { get: vi.fn(async () => ({ stages: [] })) },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const requirement = (n: number, type: 'FUNCTIONAL' | 'NON_FUNCTIONAL', name: string) => ({
  id: `r${n}`,
  projectId: 'p1',
  code: type === 'FUNCTIONAL' ? `RF-00${n}` : `RNF-00${n}`,
  createdAt: '',
  version: { id: `rv${n}`, versionNumber: 1, status: 'APPROVED', origin: 'MANUAL', createdAt: '' },
  requirement: {
    requirementType: type,
    name,
    description: '',
    priority: 'HIGH',
    actors: [],
    preconditions: [],
    postconditions: [],
    dependencyArtifactIds: [],
    sourceContextVersionId: null,
    aiRunId: null,
    origin: null,
  },
});
const requirements = [
  requirement(1, 'FUNCTIONAL', 'Registrar pedido'),
  requirement(2, 'FUNCTIONAL', 'Consultar pedidos'),
  requirement(3, 'NON_FUNCTIONAL', 'Responder rápido'),
];
const useCase = {
  id: 'u1',
  projectId: 'p1',
  code: 'CU-001',
  createdAt: '',
  version: { id: 'uv1', versionNumber: 1, status: 'APPROVED', origin: 'MANUAL', createdAt: '' },
  useCase: {
    name: 'Registrar un pedido',
    objective: 'El cliente deja registrado su pedido.',
    primaryActor: 'Cliente',
    secondaryActors: ['Cajero'],
    preconditions: ['Tener sesión'],
    postconditions: [],
    mainFlow: [
      { actor: 'Cliente', action: 'Elige los productos' },
      { actor: 'Sistema', action: 'Calcula el total' },
    ],
    alternativeFlows: [
      {
        name: 'Sin stock',
        condition: 'Un producto se agotó',
        steps: [{ actor: 'Sistema', action: 'Avisa al cliente' }],
      },
    ],
    relatedRequirementVersionIds: ['rv1'],
    relations: [],
    generationId: null,
    candidateId: null,
    aiRunId: null,
  },
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  mocks.list.mockResolvedValue({ items: [useCase] });
  mocks.latest.mockResolvedValue({ job: null });
});

const renderPage = () =>
  render(
    <TestProviders>
      <UseCasesPage />
    </TestProviders>,
  );

describe('Use cases page', () => {
  it('summarises which approved functional requirements have a use case', async () => {
    const user = userEvent.setup();
    renderPage();
    const summary = await screen.findByRole('group', { name: 'Resumen de casos de uso' });
    expect(within(summary).getByText('Requisitos realizados').parentElement).toHaveTextContent(
      '1 de 2',
    );
    await user.click(screen.getByRole('button', { name: 'Ver cuáles' }));
    expect(screen.getByRole('list', { name: 'Requisitos sin caso de uso' })).toHaveTextContent(
      'RF-002Consultar pedidos',
    );
  });

  it('archives approved use cases and only deletes those never approved', async () => {
    mocks.bulk.mockResolvedValue({ affected: 1, skipped: 0 });
    const draft = {
      ...useCase,
      id: 'u2',
      code: 'CU-002',
      version: { ...useCase.version, id: 'uv2', status: 'GENERATED' },
      useCase: { ...useCase.useCase, name: 'Consultar un pedido' },
    };
    mocks.list.mockResolvedValue({ items: [useCase, draft] });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar CU-001' }));
    expect(screen.getByText('1 seleccionado')).toBeInTheDocument();
    const toolbar = () =>
      within(screen.getByRole('toolbar', { name: 'Selección de casos de uso' }));

    // An approved one can only be archived: Eliminar and Aprobar say why and do nothing.
    expect(toolbar().getByRole('button', { name: 'Eliminar' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(toolbar().getByRole('status')).toHaveTextContent('solo se puede archivar');
    expect(toolbar().getByRole('button', { name: 'Eliminar' })).toHaveAttribute(
      'title',
      expect.stringContaining('solo se puede archivar'),
    );
    expect(toolbar().getByRole('button', { name: 'Archivar' })).not.toHaveAttribute('title');
    await user.click(toolbar().getByRole('button', { name: 'Eliminar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(toolbar().getByRole('button', { name: 'Aprobar' }));
    expect(mocks.bulk).not.toHaveBeenCalled();

    await user.click(toolbar().getByRole('button', { name: 'Archivar' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archivar' }),
    );
    await waitFor(() => expect(mocks.bulk).toHaveBeenCalledWith('p1', 'ARCHIVE', ['u1']));
    // The selection is cleared after the action.
    await waitFor(() => expect(screen.getByText('Seleccionar')).toBeInTheDocument());

    // One never approved can be deleted, after confirming.
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar CU-002' }));
    expect(toolbar().getByRole('button', { name: 'Eliminar' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
    await user.click(toolbar().getByRole('button', { name: 'Eliminar' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Eliminar definitivamente',
      }),
    );
    await waitFor(() => expect(mocks.bulk).toHaveBeenLastCalledWith('p1', 'DELETE', ['u2']));
  });

  it('opens a use case to show its flows as numbered steps', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findByText('Registrar un pedido')).closest('li')!;
    expect(within(row).getByText('RF-001')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Más acciones de CU-001' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ver detalle' }));
    expect(screen.getByText('Calcula el total')).toBeInTheDocument();
    expect(screen.getByText('Cuando: Un producto se agotó')).toBeInTheDocument();
  });

  it('generates from the chosen requirements and shows proposals as cards', async () => {
    const user = userEvent.setup();
    mocks.start.mockResolvedValue({
      id: 'job1',
      projectId: 'p1',
      status: 'COMPLETED',
      completedBatches: 1,
      totalBatches: 1,
      outputChars: 0,
      generationId: 'g1',
      errorMessage: null,
      requirementVersionIds: ['rv1', 'rv2'],
      createdAt: '2026-10-16T00:00:00.000Z',
      updatedAt: '2026-10-16T00:00:00.000Z',
    });
    mocks.generation.mockResolvedValue({
      id: 'g1',
      candidates: [
        {
          id: 'c1',
          candidateId: 'uc-1',
          name: 'Consultar pedidos',
          objective: 'El cliente revisa sus pedidos.',
          primaryActor: 'Cliente',
          secondaryActors: [],
          mainFlow: [{ actor: 'Cliente', action: 'Abre su historial' }],
          alternativeFlows: [],
          sources: [{ requirementVersionId: 'rv2' }],
        },
      ],
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Generar con IA/ }));
    expect(screen.getByText('3 de 3 seleccionados')).toBeInTheDocument();
    await user.click(screen.getByLabelText('RNF-003 Responder rápido'));
    expect(screen.getByText('2 de 3 seleccionados')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generar con 2 requisitos' }));
    expect(mocks.start).toHaveBeenCalledWith('p1', ['rv1', 'rv2']);
    expect(mocks.generation).toHaveBeenCalledWith('p1', 'g1');
    expect(await screen.findByText('El cliente revisa sus pedidos.')).toBeInTheDocument();
    expect(screen.getByTitle('Consultar pedidos')).toHaveTextContent('RF-002');
  });

  it('pages a long list of use cases and respects page size changes', async () => {
    const manyUseCases = Array.from({ length: 25 }, (_, i) => ({
      ...useCase,
      id: `u-${i + 1}`,
      code: `CU-${String(i + 1).padStart(3, '0')}`,
      useCase: { ...useCase.useCase, name: `Caso de uso ${i + 1}` },
    }));
    mocks.list.mockResolvedValue({ items: manyUseCases });
    const user = userEvent.setup();
    renderPage();

    // Default pageSize is 20: page 1 shows CU-001 through CU-020
    expect(await screen.findByText('CU-001')).toBeInTheDocument();
    expect(screen.getByText('CU-020')).toBeInTheDocument();
    expect(screen.queryByText('CU-021')).not.toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();

    // Navigate to page 2
    await user.click(screen.getByRole('button', { name: 'Página 2' }));
    expect(screen.getByText('CU-021')).toBeInTheDocument();
    expect(screen.queryByText('CU-001')).not.toBeInTheDocument();

    // Select all on page 2: selects the 5 items on page 2
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar los de esta página' }));
    expect(screen.getByText('5 seleccionados')).toBeInTheDocument();

    // Change page size to 50: all 25 appear on page 1 and single-page nav hides
    const pageSizeSelects = screen.getAllByRole('combobox', { name: 'Elementos por página' });
    await user.selectOptions(pageSizeSelects[0]!, '50');
    expect(screen.getByText('CU-001')).toBeInTheDocument();
    expect(screen.getByText('CU-025')).toBeInTheDocument();
    expect(window.localStorage.getItem('caseflow.pageSize.useCases')).toBe('50');
  });

  it('restores persisted page size from localStorage on mount', async () => {
    window.localStorage.setItem('caseflow.pageSize.useCases', '10');
    const manyUseCases = Array.from({ length: 15 }, (_, i) => ({
      ...useCase,
      id: `u-${i + 1}`,
      code: `CU-${String(i + 1).padStart(3, '0')}`,
      useCase: { ...useCase.useCase, name: `Caso de uso ${i + 1}` },
    }));
    mocks.list.mockResolvedValue({ items: manyUseCases });
    renderPage();

    // Persisted pageSize is 10: page 1 shows CU-001 through CU-010
    expect(await screen.findByText('CU-001')).toBeInTheDocument();
    expect(screen.getByText('CU-010')).toBeInTheDocument();
    expect(screen.queryByText('CU-011')).not.toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
  });
});
