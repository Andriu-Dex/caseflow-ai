import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequirementManualForm } from './requirement-manual-form';
import { TestProviders } from '../lib/test-utils';

const mocks = vi.hoisted(() => ({ create: vi.fn(), createVersion: vi.fn(), toastError: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: (...a: unknown[]) => mocks.toastError(...a) },
}));
vi.mock('../lib/api', () => ({
  api: {
    requirements: {
      create: (...args: unknown[]) => mocks.create(...args),
      createVersion: (...args: unknown[]) => mocks.createVersion(...args),
      contextCoverage: vi.fn(async () => ({
        context: { artifactId: ctx, versionId: ctx, versionNumber: 1, code: 'CTX' },
        items: [
          { ...item('N-1', '1', 'Registrar pedidos'), coveredBy: ['RF-001'] },
          { ...item('N-2', '2', 'Consultar pedidos'), coveredBy: [] },
        ],
        withoutOrigin: [],
      })),
    },
    context: { getCurrent: vi.fn(async () => ({ actors: [{ name: 'Cliente' }] })) },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const ctx = '00000000-0000-4000-8000-000000000009';
const item = (code: string, n: string, description: string) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  kind: 'NEED' as const,
  code,
  description,
  contextVersionId: ctx,
  mandatory: true,
});
const existing = {
  id: '00000000-0000-4000-8000-000000000101',
  projectId: 'p1',
  code: 'RF-001',
  createdAt: '',
  version: { id: 'v', versionNumber: 1, status: 'APPROVED', origin: 'MANUAL', createdAt: '' },
  requirement: {
    requirementType: 'FUNCTIONAL',
    name: 'Iniciar sesión',
    description: 'El usuario inicia sesión.',
    priority: 'HIGH',
    actors: [],
    preconditions: [],
    postconditions: [],
    dependencyArtifactIds: [],
    sourceContextVersionId: null,
    aiRunId: null,
    origin: {
      kind: 'USER_DECISION',
      justification: 'Lo pidió el cliente.',
      contextItems: [],
    },
  },
} as const;

function renderForm(initial?: typeof existing) {
  const onCreated = vi.fn();
  render(
    <TestProviders>
      <RequirementManualForm
        projectId="p1"
        existingRequirements={[existing as never]}
        initial={initial as never}
        onCreated={onCreated}
        onCancel={vi.fn()}
      />
    </TestProviders>,
  );
  return onCreated;
}

beforeEach(() => {
  mocks.create.mockResolvedValue({});
  mocks.createVersion.mockResolvedValue({});
});

describe('Requirement form', () => {
  it('creates a requirement that answers the context, one condition per row', async () => {
    const user = userEvent.setup();
    const onCreated = renderForm();
    await user.type(screen.getByLabelText('Nombre'), 'Consultar pedidos');
    await user.type(screen.getByLabelText('Descripción'), 'El cliente consulta sus pedidos.');
    await user.click(screen.getByRole('radio', { name: 'Baja' }));
    await user.click(await screen.findByLabelText('N-2 Consultar pedidos'));
    expect(screen.getByText(/ya lo atiende RF-001/)).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Cliente' }));
    await user.click(screen.getByRole('button', { name: 'Agregar precondición' }));
    // A comma never splits a condition.
    await user.type(
      screen.getByLabelText('Precondiciones 1'),
      'Los pedidos están registrados, con su estado',
    );
    await user.type(screen.getByLabelText('Buscar requisito del que depende'), 'sesión');
    await user.click(
      within(screen.getByRole('list', { name: 'Requisitos disponibles' })).getByRole('button'),
    );
    await user.click(screen.getByRole('button', { name: 'Crear requisito' }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith('p1', {
        requirementType: 'FUNCTIONAL',
        name: 'Consultar pedidos',
        description: 'El cliente consulta sus pedidos.',
        priority: 'LOW',
        actors: ['Cliente'],
        preconditions: ['Los pedidos están registrados, con su estado'],
        postconditions: [],
        dependencyArtifactIds: [existing.id],
        origin: { kind: 'CONTEXT', contextItemIds: ['00000000-0000-4000-8000-000000000002'] },
      }),
    );
    expect(onCreated).toHaveBeenCalled();
  });

  it('asks why the requirement exists before saving', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Nombre'), 'Exportar');
    await user.type(screen.getByLabelText('Descripción'), 'Exporta a Excel.');
    await user.click(screen.getByRole('button', { name: 'Crear requisito' }));
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Seleccione qué elementos del contexto atiende este requisito.',
    );
    await user.click(screen.getByRole('radio', { name: 'Decisión propia' }));
    await user.click(screen.getByRole('button', { name: 'Crear requisito' }));
    expect(mocks.toastError).toHaveBeenLastCalledWith(
      'Explique por qué se incluye este requisito.',
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('edits into a new version keeping the declared origin', async () => {
    const user = userEvent.setup();
    renderForm(existing);
    expect(screen.getByRole('dialog', { name: 'Editar requisito' })).toHaveTextContent(
      'se creará la versión 2',
    );
    expect(screen.getByLabelText('Justificación')).toHaveValue('Lo pidió el cliente.');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mocks.createVersion).toHaveBeenCalledWith(
        'p1',
        existing.id,
        expect.objectContaining({
          origin: { kind: 'USER_DECISION', justification: 'Lo pidió el cliente.' },
        }),
      ),
    );
  });
});
