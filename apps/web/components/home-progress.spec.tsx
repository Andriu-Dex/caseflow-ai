import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadinessStage } from '@caseflow-ai/contracts';
import { TestProviders } from '../lib/test-utils';
import { HomeConstruction, HomeNextStep } from './home-progress';

const mocks = vi.hoisted(() => ({ deployments: vi.fn(), construction: vi.fn() }));
vi.mock('../lib/api', () => ({
  api: { deployments: { list: (...args: unknown[]) => mocks.deployments(...args) } },
  restoreSession: vi.fn(),
}));
vi.mock('../lib/use-construction-state', () => ({
  useConstructionState: () => ({ data: mocks.construction(), isLoading: false }),
}));

const stage = (key: string, label: string, satisfied: boolean, extra = {}) =>
  ({
    key,
    label,
    satisfied,
    summary: `${label}: resumen`,
    blockers: [],
    warnings: [],
    nextAction: null,
    ...extra,
  }) as ReadinessStage;
const built = {
  hasApprovedGenerationPlan: true,
  hasApprovedConceptualModel: true,
  hasDesignBaseline: true,
  hasApprovedImplementationPlan: true,
  hasGeneratedCode: true,
  hasValidatedCode: true,
};

describe('HomeNextStep', () => {
  beforeEach(() => {
    mocks.deployments.mockResolvedValue({ items: [] });
    mocks.construction.mockReturnValue({
      ...built,
      hasGeneratedCode: false,
      hasValidatedCode: false,
    });
  });

  it('points to the first incomplete planning step with why it is pending', async () => {
    render(
      <HomeNextStep
        projectId="p1"
        stages={[
          stage('SOURCES', 'Fuentes del proyecto', true),
          stage('REQUIREMENTS', 'Requisitos', false, {
            nextAction: 'Apruebe los requisitos pendientes.',
            blockers: ['Hay 3 requisitos en borrador.'],
          }),
        ]}
      />,
      { wrapper: TestProviders },
    );
    expect(await screen.findByText('Siguiente paso: Requisitos')).toBeInTheDocument();
    expect(screen.getByText('Apruebe los requisitos pendientes.')).toBeInTheDocument();
    expect(screen.getByText('Hay 3 requisitos en borrador.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ir a Requisitos/ })).toHaveAttribute(
      'href',
      '/requirements',
    );
  });

  it('continues with the construction once the planning is complete, then the demonstration', async () => {
    const { rerender } = render(
      <HomeNextStep projectId="p1" stages={[stage('SOURCES', 'Fuentes', true)]} />,
      { wrapper: TestProviders },
    );
    expect(await screen.findByText('Siguiente paso: Código generado')).toBeInTheDocument();
    mocks.construction.mockReturnValue(built);
    rerender(<HomeNextStep projectId="p1" stages={[stage('SOURCES', 'Fuentes', true)]} />);
    expect(await screen.findByText('Siguiente paso: Publicar la demostración')).toBeInTheDocument();
  });

  it('says everything is done when the demonstration is online', async () => {
    mocks.construction.mockReturnValue(built);
    mocks.deployments.mockResolvedValue({
      items: [{ id: 'd1', status: 'RUNNING', publicUrl: 'https://demo.example.com' }],
    });
    render(<HomeNextStep projectId="p1" stages={[stage('SOURCES', 'Fuentes', true)]} />, {
      wrapper: TestProviders,
    });
    expect(await screen.findByText(/Todo listo/)).toBeInTheDocument();
  });
});

describe('HomeConstruction', () => {
  it('shows each construction step and opens the demonstration that is online', async () => {
    mocks.construction.mockReturnValue({ ...built, hasValidatedCode: false });
    mocks.deployments.mockResolvedValue({
      items: [{ id: 'd1', status: 'RUNNING', publicUrl: 'https://demo.example.com' }],
    });
    render(<HomeConstruction projectId="p1" stages={[]} />, { wrapper: TestProviders });
    expect(await screen.findByText('5 / 6 pasos')).toBeInTheDocument();
    expect(screen.getByText('Código validado').parentElement?.textContent).toContain('(pendiente)');
    expect(await screen.findByRole('link', { name: /Abrir la demostración/ })).toHaveAttribute(
      'href',
      'https://demo.example.com',
    );
  });
});
