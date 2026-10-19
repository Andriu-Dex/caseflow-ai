import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationPlanPage from './page';
import { TestProviders } from '../../../lib/test-utils';
import type { GenerationPlanContent } from '@caseflow-ai/contracts';

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
      list: vi.fn(async () => ({ items: [] })),
    },
    useCases: {
      list: vi.fn(async () => ({ items: [] })),
    },
    dataModels: {
      list: vi.fn(async () => ({ items: [] })),
    },
    readiness: {
      get: vi.fn(async () => ({ stages: [] })),
    },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const planContent: GenerationPlanContent = {
  summary: 'Plan detallado de generación para el sistema e-commerce.',
  modules: [
    {
      localId: 'mod-1',
      name: 'Catálogo de Productos',
      purpose: 'Gestionar categorías y artículos.',
      entityNames: ['Product', 'Category'],
      relatedRequirementCodes: ['RF-001'],
      relatedUseCaseCodes: ['CU-001'],
    },
  ],
  actors: [
    { name: 'Admin', permissions: ['all'] },
    { name: 'Cliente', permissions: ['buy'] },
  ],
  workflows: [
    {
      localId: 'wf-1',
      name: 'Compra de Producto',
      steps: ['Buscar', 'Agregar al carrito', 'Pagar'],
      relatedUseCaseCodes: ['CU-001'],
    },
  ],
  screens: [{ name: 'Inicio', moduleLocalId: 'mod-1', purpose: 'Home page' }],
  integrations: [],
  authentication: {
    required: true,
    strategy: 'JWT',
    roles: ['ADMIN', 'CLIENT'],
  },
  technicalConstraints: ['TypeScript', 'NestJS'],
  risks: [{ description: 'Fallo de pasarela', mitigation: 'Reintentos automáticos' }],
};

const planArtifact = {
  id: 'gp-1',
  code: 'PG-001',
  title: 'Plan de generación principal',
  kind: 'GENERATION_PLAN',
  content: planContent,
  version: {
    id: 'gp-v1',
    versionNumber: 1,
    status: 'APPROVED',
  },
};

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  mocks.list.mockImplementation(async (_: string, kind: string) => {
    if (kind === 'GENERATION_PLAN') {
      return { items: [planArtifact] };
    }
    return { items: [] };
  });
});

describe('GenerationPlanPage', () => {
  it('renders the page heading', async () => {
    render(
      <TestProviders>
        <GenerationPlanPage />
      </TestProviders>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Plan de generación', level: 1 }),
      ).toBeInTheDocument();
    });
  });

  it('renders KPI metrics badges for the generation plan in the version card', async () => {
    render(
      <TestProviders>
        <GenerationPlanPage />
      </TestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText('PG-001')).toBeInTheDocument();
    });

    // KPI metrics: 1 módulo de software, 2 actores, 1 flujo principal, 1 pantalla planificada, autenticación activa, 1 riesgo analizado
    expect(screen.getByText('1 módulo de software')).toBeInTheDocument();
    expect(screen.getByText('2 actores')).toBeInTheDocument();
    expect(screen.getByText('1 flujo principal')).toBeInTheDocument();
    expect(screen.getByText('1 pantalla planificada')).toBeInTheDocument();
    expect(screen.getByText('1 autenticación activa')).toBeInTheDocument();
    expect(screen.getByText('1 riesgo analizado')).toBeInTheDocument();
  });

  it('toggles detail and renders GenerationPlanDetail with rich content', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <GenerationPlanPage />
      </TestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText('PG-001')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole('button', { name: /Ver detalle/i });
    await user.click(toggleBtn);

    // Should display the executive summary and modules
    expect(screen.getByText('Resumen del Sistema a Construir')).toBeInTheDocument();
    expect(
      screen.getByText(/Plan detallado de generación para el sistema e-commerce/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Catálogo de Productos')).toBeInTheDocument();
    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Compra de Producto')).toBeInTheDocument();
  });
});
