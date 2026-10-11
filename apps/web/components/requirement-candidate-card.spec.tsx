import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CandidateReview } from './candidate-review';
import {
  RequirementCandidateCard,
  defaultRequirementSelection,
  requirementDependencies,
} from './requirement-candidate-card';
import { ContextCoverageSummary } from './context-coverage';
import type { GenerationResult } from '../lib/api';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const generation: GenerationResult = {
  id: 'batch',
  candidates: [
    {
      id: 'login',
      candidateId: 'rc-1',
      name: 'Iniciar sesión',
      requirementType: 'FUNCTIONAL',
      priority: 'HIGH',
      description: 'El usuario se autentica con correo y contraseña.',
      actors: ['Cliente', 'Administrador'],
      preconditions: ['Tener una cuenta'],
      postconditions: ['Sesión iniciada'],
      outgoingDependencies: [],
    },
    {
      id: 'orders',
      candidateId: 'rc-2',
      name: 'Registrar pedido',
      requirementType: 'FUNCTIONAL',
      priority: 'MEDIUM',
      description: 'El cliente registra un pedido.',
      actors: ['Cliente'],
      preconditions: [],
      postconditions: [],
      outgoingDependencies: [{ dependsOnCandidateId: 'login' }],
    },
    {
      id: 'speed',
      candidateId: 'rc-3',
      name: 'Responder en menos de 2 s',
      requirementType: 'NON_FUNCTIONAL',
      priority: 'LOW',
      description: 'Las pantallas responden en menos de dos segundos.',
      actors: [],
      preconditions: [],
      postconditions: [],
      outgoingDependencies: [],
    },
  ],
};

function renderReview(onAccept = vi.fn().mockResolvedValue(undefined)) {
  render(
    <CandidateReview
      generation={generation}
      describe={(c) => c.name ?? ''}
      renderCard={(c, index) => (
        <RequirementCandidateCard
          candidate={c}
          index={index}
          nameOf={(id) => generation.candidates.find((x) => x.id === id)?.name ?? ''}
        />
      )}
      filters={[
        {
          id: 'nf',
          label: 'No funcionales',
          matches: (c) => c.requirementType === 'NON_FUNCTIONAL',
        },
      ]}
      dependenciesOf={requirementDependencies}
      onAccept={onAccept}
      onDismiss={vi.fn()}
    />,
  );
  return onAccept;
}

describe('Requirement proposals as cards', () => {
  it('shows type, priority, actors, dependencies and the conditions on demand', async () => {
    renderReview();
    expect(screen.getAllByText('Funcional')).toHaveLength(2);
    expect(screen.getByText('Prioridad alta')).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(screen.getByText('Depende de:').parentElement).toHaveTextContent('Iniciar sesión');

    const login = screen.getByLabelText('Incorporar Iniciar sesión');
    await userEvent.click(screen.getAllByRole('button', { name: 'Ver detalle y condiciones' })[0]!);
    expect(screen.getByText('Tener una cuenta')).toBeInTheDocument();
    // Expanding the card never toggles its selection.
    expect(login).toBeChecked();
  });

  it('keeps a proposal and the ones it depends on selected together', async () => {
    const onAccept = renderReview();
    await userEvent.click(screen.getByLabelText('Incorporar Iniciar sesión'));
    // Registrar pedido depends on it, so it leaves the selection too.
    expect(screen.getByLabelText('Incorporar Registrar pedido')).not.toBeChecked();
    await userEvent.click(screen.getByLabelText('Incorporar Registrar pedido'));
    expect(screen.getByLabelText('Incorporar Iniciar sesión')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /Incorporar 3 de 3/ }));
    expect(onAccept).toHaveBeenCalledWith(expect.arrayContaining(['login', 'orders', 'speed']));
  });

  it('filters the proposals by kind', async () => {
    renderReview();
    const tabs = screen.getByRole('tablist', { name: 'Filtrar propuestas' });
    await userEvent.click(within(tabs).getByRole('tab', { name: /No funcionales/ }));
    expect(screen.getByText('Responder en menos de 2 s')).toBeInTheDocument();
    expect(screen.queryByText('Iniciar sesión')).not.toBeInTheDocument();
  });
});

describe('Requirement proposals against the project context', () => {
  const item = (code: string, kind: 'NEED' | 'BUSINESS_RULE' | 'CONSTRAINT', id: string) => ({
    id: `00000000-0000-4000-8000-00000000000${id}`,
    contextVersionId: '00000000-0000-4000-8000-000000000009',
    code,
    kind,
    description: `Texto de ${code}`,
    mandatory: kind !== 'CONSTRAINT',
  });
  const withContext: GenerationResult = {
    id: 'batch',
    candidates: [
      { ...generation.candidates[0]!, contextItemCodes: ['N-1'] },
      { ...generation.candidates[2]!, contextItemCodes: ['RES-1'] },
      {
        ...generation.candidates[1]!,
        id: 'idea',
        name: 'Avisar por correo',
        suggested: true,
        rationale: 'Evita llamadas para preguntar por el pedido.',
        outgoingDependencies: [{ dependsOnCandidateId: 'login' }],
      },
    ],
    coverage: [
      { ...item('N-1', 'NEED', '1'), coveredBy: ['login'] },
      { ...item('N-2', 'NEED', '2'), coveredBy: [] },
      { ...item('RES-1', 'CONSTRAINT', '3'), coveredBy: ['speed'] },
    ],
  };

  function renderWithContext() {
    render(
      <CandidateReview
        generation={withContext}
        describe={(c) => c.name ?? ''}
        defaultSelected={defaultRequirementSelection(withContext.candidates)}
        renderCard={(c, index) => (
          <RequirementCandidateCard
            candidate={c}
            index={index}
            nameOf={() => ''}
            contextItems={new Map(withContext.coverage!.map((i) => [i.code, i] as const))}
          />
        )}
        summary={(selected) => (
          <ContextCoverageSummary
            subject="Las propuestas seleccionadas"
            items={withContext.coverage!.map((i) => ({
              ...i,
              covered: i.coveredBy.some((id) => selected.includes(id)),
            }))}
          />
        )}
        optional={{
          title: 'Ideas para mejorar tu software',
          description: 'Sugerencias',
          matches: (c) => c.suggested === true,
        }}
        dependenciesOf={requirementDependencies}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
  }

  it('shows which context items each proposal covers and what is still missing', async () => {
    renderWithContext();
    expect(screen.getByTitle('Necesidad: Texto de N-1')).toHaveTextContent('N-1');
    expect(
      screen.getByText(/cubren 1 de 2 necesidades; falta cubrir el resto/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver qué falta' }));
    const missing = screen.getByRole('list', { name: 'Elementos del contexto sin cubrir' });
    expect(missing).toHaveTextContent('Texto de N-2');
    expect(missing).not.toHaveTextContent('Texto de N-1');

    // The summary follows the selection.
    await userEvent.click(screen.getByLabelText('Incorporar Iniciar sesión'));
    expect(screen.getByText(/cubren 0 de 2 necesidades/)).toBeInTheDocument();
  });

  it('keeps ideas beyond the context folded and unselected', async () => {
    renderWithContext();
    expect(screen.getByText(/y 1 idea adicional/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Incorporar Avisar por correo')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ideas para mejorar tu software/ }));
    expect(screen.getByLabelText('Incorporar Avisar por correo')).not.toBeChecked();
    expect(screen.getByText('Evita llamadas para preguntar por el pedido.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Incorporar 2 de 3/ })).toBeEnabled();
  });
});
