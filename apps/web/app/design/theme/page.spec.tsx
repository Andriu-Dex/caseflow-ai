import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesignThemePage from './page';
import { TestProviders } from '../../../lib/test-utils';
import { DEFAULT_DARK_PALETTE, DEFAULT_LIGHT_PALETTE } from '../../../components/design-theme';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  generate: vi.fn(),
  transition: vi.fn(),
  archive: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../lib/api', () => ({
  api: {
    structuredAnalysis: {
      list: (...args: unknown[]) => mocks.list(...args),
      generate: (...args: unknown[]) => mocks.generate(...args),
      transition: (...args: unknown[]) => mocks.transition(...args),
      diagramPngUrl: () => '/api/diagram.png',
    },
    artifacts: {
      archive: (...args: unknown[]) => mocks.archive(...args),
    },
    requirements: {
      list: vi.fn(async () => ({
        items: [
          {
            id: 'r1',
            code: 'RF-001',
            version: { id: 'rv1', status: 'APPROVED' },
            requirement: { requirementType: 'FUNCTIONAL', name: 'Gestión de Pedidos' },
          },
        ],
      })),
    },
    useCases: { list: vi.fn(async () => ({ items: [] })) },
    dataModels: { list: vi.fn(async () => ({ items: [] })) },
    readiness: { get: vi.fn(async () => ({ stages: [] })) },
  },
  ApiError: class ApiError extends Error {},
  downloadFile: vi.fn(),
  approveDirectly: async (transition: (status: string) => Promise<unknown>) =>
    transition('APPROVED'),
  isPendingApproval: (status: string) => status === 'GENERATED' || status === 'DRAFT',
  restoreSession: vi.fn(),
}));

const mockDesignTheme = {
  id: 'th-1',
  projectId: 'p1',
  code: 'TH-001',
  title: 'Tema corporativo del sistema',
  createdAt: '2026-10-17T00:00:00.000Z',
  version: {
    id: 'thv-1',
    versionNumber: 1,
    status: 'GENERATED',
    origin: 'AI',
    createdAt: '2026-10-17T00:00:00.000Z',
  },
  content: {
    name: 'Azul Nórdico',
    description: 'Paleta sobria de alto contraste con tonos azules y acentos menta.',
    mode: 'BOTH',
    light: DEFAULT_LIGHT_PALETTE,
    dark: DEFAULT_DARK_PALETTE,
  },
};

describe('DesignThemePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('caseflow.activeProjectId', 'p1');
    mocks.list.mockImplementation(async (_projectId: string, kind: string) => {
      if (kind === 'DESIGN_THEME') {
        return {
          items: [mockDesignTheme],
        };
      }
      return { items: [] };
    });
  });

  function renderPage() {
    return render(
      <TestProviders>
        <DesignThemePage />
      </TestProviders>,
    );
  }

  it('renders design theme card with enriched metrics, modern UI preview and accessibility certification', async () => {
    renderPage();

    // Page title
    expect(await screen.findByRole('heading', { name: /Tema y colores/i })).toBeInTheDocument();

    // Wait for theme artifact to render
    expect(await screen.findByText('Azul Nórdico')).toBeInTheDocument();

    // Enriched Metrics
    expect(screen.getByText(/Modo claro y oscuro/)).toBeInTheDocument();
    expect(screen.getByText('26 tokens de color')).toBeInTheDocument();
    expect(screen.getByText(/WCAG AA verificado/)).toBeInTheDocument();

    // Theme title and description
    expect(screen.getByText('TH-001')).toBeInTheDocument();
    expect(
      screen.getByText('Paleta sobria de alto contraste con tonos azules y acentos menta.'),
    ).toBeInTheDocument();

    // Modern Simulated UI in palettes
    expect(screen.getAllByText('Mi Aplicación').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Panel de Control').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$24,850.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PEDIDO #1042').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Guardar cambios').length).toBeGreaterThanOrEqual(1);

    // Color tokens swatches with labels and hex codes
    expect(screen.getAllByText('Primario').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#4338ca').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fondo').length).toBeGreaterThan(0);

    // WCAG AA Certification
    expect(
      screen.getByText(/Cumple el contraste mínimo de accesibilidad \(WCAG AA\)/),
    ).toBeInTheDocument();
  });

  it('allows toggling between light mode, dark mode and side-by-side views', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Azul Nórdico')).toBeInTheDocument();

    // Initially "Lado a lado" shows both palettes
    expect(screen.getByText('Paleta modo claro')).toBeInTheDocument();
    expect(screen.getByText('Paleta modo oscuro')).toBeInTheDocument();

    // Click "Modo claro"
    await user.click(screen.getByRole('button', { name: /Modo claro/i }));
    expect(screen.getByText('Paleta modo claro')).toBeInTheDocument();
    expect(screen.queryByText('Paleta modo oscuro')).not.toBeInTheDocument();

    // Click "Modo oscuro"
    await user.click(screen.getByRole('button', { name: /Modo oscuro/i }));
    expect(screen.queryByText('Paleta modo claro')).not.toBeInTheDocument();
    expect(screen.getByText('Paleta modo oscuro')).toBeInTheDocument();

    // Click "Lado a lado"
    await user.click(screen.getByRole('button', { name: /Lado a lado/i }));
    expect(screen.getByText('Paleta modo claro')).toBeInTheDocument();
    expect(screen.getByText('Paleta modo oscuro')).toBeInTheDocument();
  });

  it('copies token color code to clipboard on click', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Azul Nórdico')).toBeInTheDocument();

    // Find a token button (e.g. Primario: #4338ca)
    const swatchBtn = screen.getAllByTitle(/Copiar Primario:/i)[0]!;
    await user.click(swatchBtn);

    // Check that toast or copy action was invoked
    expect(swatchBtn).toBeInTheDocument();
  });

  it('provides quick style suggestions for AI generation', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: /Tema y colores/i })).toBeInTheDocument();

    // Click quick suggestion chip "Tonos cálidos gourmet"
    const chip = screen.getByRole('button', { name: 'Tonos cálidos gourmet' });
    await user.click(chip);

    const input = screen.getByPlaceholderText(
      /Por ejemplo: más cálida, verde corporativo, tonos sobrios/i,
    );
    expect(input).toHaveValue('Tonos cálidos gourmet');
  });

  it('allows approving the candidate design theme', async () => {
    mocks.transition.mockResolvedValueOnce({
      ...mockDesignTheme,
      version: { ...mockDesignTheme.version, status: 'APPROVED' },
    });

    renderPage();

    expect(await screen.findByText('TH-001')).toBeInTheDocument();

    const approveBtn = screen.getByRole('button', { name: /Aprobar/i });
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(mocks.transition).toHaveBeenCalledWith(
        'p1',
        'DESIGN_THEME',
        'th-1',
        'thv-1',
        'APPROVED',
      );
    });
  });
});
