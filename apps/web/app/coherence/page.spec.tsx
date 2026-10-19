import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CoherencePage from './page';
import { TestProviders } from '../../lib/test-utils';

const getConsistency = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    consistency: { get: (...args: unknown[]) => getConsistency(...args) },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const mockReportAllClean = {
  standard: 'CASEFLOW_V1',
  totalArtifacts: 12,
  coherenceRequired: true,
  issues: [],
};

const mockReportWithGaps = {
  standard: 'CASEFLOW_V1',
  totalArtifacts: 15,
  coherenceRequired: true,
  issues: [
    {
      rule: 'CONTEXT_REQUIREMENT',
      severity: 'ERROR',
      message: 'La necesidad NEC-001 no tiene un requisito aprobado que la atienda.',
      chain: 'CONTEXT_REQUIREMENT',
      artifactType: 'REQUIREMENT',
      affectedArtifactIds: ['00000000-0000-0000-0000-000000000001'],
    },
    {
      rule: 'REQUIREMENT_USE_CASE_SCREEN',
      severity: 'WARNING',
      message: 'El caso de uso CU-002 no aparece en ninguna pantalla del plano de interfaz.',
      chain: 'REQUIREMENT_USE_CASE_SCREEN',
      artifactType: 'UI_BLUEPRINT',
      affectedArtifactIds: ['00000000-0000-0000-0000-000000000002'],
    },
    {
      rule: 'CONTEXT_REQUIREMENT',
      severity: 'OBSERVATION',
      message: 'La restricción RES-001 se mantiene como observación.',
      chain: 'CONTEXT_REQUIREMENT',
      artifactType: 'REQUIREMENT',
      affectedArtifactIds: ['00000000-0000-0000-0000-000000000003'],
    },
  ],
};

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  getConsistency.mockReset().mockResolvedValue(mockReportAllClean);
});

describe('CoherencePage', () => {
  it('renders the 6 coherence chains and summary KPIs when all chains are satisfied', async () => {
    render(
      <TestProviders>
        <CoherencePage />
      </TestProviders>,
    );

    expect(
      await screen.findByRole('heading', { name: /Matriz de coherencia/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cadenas Coherentes')).toBeInTheDocument();
    expect(screen.getByText('Huecos Detectados')).toBeInTheDocument();
    expect(screen.getByText('Régimen de Rigor')).toBeInTheDocument();
    expect(screen.getByText('0 huecos abiertos')).toBeInTheDocument();
    expect(screen.getByText(/de 6 \(100%\)/i)).toBeInTheDocument();

    // Policy banner
    expect(screen.getByText(/En este proyecto la coherencia es obligatoria/i)).toBeInTheDocument();

    // All 6 chains rendered
    expect(screen.getByText('Requisito no funcional → diseño')).toBeInTheDocument();
    expect(screen.getByText('Contexto → requisito')).toBeInTheDocument();
    expect(screen.getByText('Requisito → caso de uso → pantalla')).toBeInTheDocument();
    expect(screen.getByText('Entidad → clase → plan de implementación')).toBeInTheDocument();
    expect(screen.getByText('Navegación → pantalla → ruta')).toBeInTheDocument();
    expect(screen.getByText('Acción de pantalla → operación o endpoint')).toBeInTheDocument();

    // Clean status message
    expect(screen.getAllByText(/Sin huecos en lo aprobado hasta ahora/i).length).toBe(6);
  });

  it('renders gaps with severity badges and action buttons linking to the fix page', async () => {
    getConsistency.mockResolvedValueOnce(mockReportWithGaps);

    render(
      <TestProviders>
        <CoherencePage />
      </TestProviders>,
    );

    expect(
      await screen.findByText(
        'La necesidad NEC-001 no tiene un requisito aprobado que la atienda.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'El caso de uso CU-002 no aparece en ninguna pantalla del plano de interfaz.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('La restricción RES-001 se mantiene como observación.'),
    ).toBeInTheDocument();

    // Severity badges
    expect(screen.getByText('Bloqueante')).toBeInTheDocument();
    expect(screen.getByText('Advertencia')).toBeInTheDocument();
    expect(screen.getByText('Observación')).toBeInTheDocument();

    // Action button to fix on requirements page
    const fixReqBtns = screen.getAllByRole('link', { name: /Corregir en Requisitos/i });
    expect(fixReqBtns.length).toBeGreaterThan(0);
    expect(fixReqBtns[0]).toHaveAttribute('href', '/requirements');

    // Action button to fix on UI blueprint page
    const fixUiBtn = screen.getByRole('link', { name: /Corregir en Plano de interfaz/i });
    expect(fixUiBtn).toHaveAttribute('href', '/design/ui-blueprint');
  });

  it('allows filtering chains by status: all, with gaps, and satisfied', async () => {
    getConsistency.mockResolvedValueOnce(mockReportWithGaps);
    const user = userEvent.setup();

    render(
      <TestProviders>
        <CoherencePage />
      </TestProviders>,
    );

    await screen.findByText('Contexto → requisito');
    expect(screen.getByText('Acción de pantalla → operación o endpoint')).toBeInTheDocument();

    // Click "Con huecos pendientes"
    const openFilterBtn = screen.getByRole('button', { name: /Con huecos pendientes \(2\)/i });
    await user.click(openFilterBtn);

    // Only Contexto -> requisito and Requisito -> caso de uso -> pantalla have open gaps
    expect(screen.getByText('Contexto → requisito')).toBeInTheDocument();
    expect(screen.getByText('Requisito → caso de uso → pantalla')).toBeInTheDocument();
    expect(screen.queryByText('Acción de pantalla → operación o endpoint')).not.toBeInTheDocument();
    expect(screen.queryByText('Entidad → clase → plan de implementación')).not.toBeInTheDocument();

    // Click "Satisfechas"
    const satisfiedFilterBtn = screen.getByRole('button', { name: /Satisfechas \(4\)/i });
    await user.click(satisfiedFilterBtn);

    expect(screen.getByText('Acción de pantalla → operación o endpoint')).toBeInTheDocument();
    expect(screen.getByText('Entidad → clase → plan de implementación')).toBeInTheDocument();
    expect(screen.queryByText('Contexto → requisito')).not.toBeInTheDocument();

    // Click "Todas las cadenas"
    const allFilterBtn = screen.getByRole('button', { name: /Todas las cadenas \(6\)/i });
    await user.click(allFilterBtn);

    expect(screen.getByText('Contexto → requisito')).toBeInTheDocument();
    expect(screen.getByText('Acción de pantalla → operación o endpoint')).toBeInTheDocument();
  });

  it('renders permissive mode notice when coherence is not required', async () => {
    getConsistency.mockResolvedValueOnce({
      ...mockReportAllClean,
      coherenceRequired: false,
    });

    render(
      <TestProviders>
        <CoherencePage />
      </TestProviders>,
    );

    expect(
      await screen.findByText(/Este proyecto se creó antes de la coherencia obligatoria/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Permisiva')).toBeInTheDocument();
    expect(screen.getByText('Modo informativo')).toBeInTheDocument();
  });
});
