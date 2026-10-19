import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConceptualModelPage from './page';
import { TestProviders } from '../../../lib/test-utils';
import type { ConceptualDomainModelContent } from '@caseflow-ai/contracts';

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

const conceptualContent: ConceptualDomainModelContent = {
  entities: [
    {
      localId: 'ent-1',
      name: 'Cliente',
      description: 'Usuario comprador en la plataforma.',
      moduleName: 'Usuarios',
      attributes: [
        { name: 'email', required: true },
        { name: 'nombre', required: true },
      ],
    },
    {
      localId: 'ent-2',
      name: 'Pedido',
      description: 'Orden de compra realizada por un cliente.',
      moduleName: 'Ventas',
      attributes: [
        { name: 'total', required: true },
        { name: 'estado', required: true },
      ],
    },
  ],
  relationships: [
    {
      fromLocalId: 'ent-1',
      toLocalId: 'ent-2',
      name: 'realiza',
      cardinality: 'ONE_TO_MANY',
      description: 'Un cliente puede realizar múltiples pedidos.',
    },
  ],
};

const conceptualArtifact = {
  id: 'cmd-1',
  code: 'MC-001',
  title: 'Modelo conceptual principal',
  kind: 'CONCEPTUAL_DOMAIN_MODEL',
  content: conceptualContent,
  version: {
    id: 'cmd-v1',
    versionNumber: 1,
    status: 'APPROVED',
  },
};

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  mocks.list.mockImplementation(async (_: string, kind: string) => {
    if (kind === 'CONCEPTUAL_DOMAIN_MODEL') {
      return { items: [conceptualArtifact] };
    }
    return { items: [] };
  });
});

describe('ConceptualModelPage', () => {
  it('renders page heading and bottom navigation links', async () => {
    render(
      <TestProviders>
        <ConceptualModelPage />
      </TestProviders>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Modelo conceptual', level: 1 }),
      ).toBeInTheDocument();
    });

    // Check footer navigation buttons
    const prevLink = screen.getByRole('link', { name: /Anterior: Plan de generación/i });
    expect(prevLink).toHaveAttribute('href', '/construction/generation-plan');

    const nextLink = screen.getByRole('link', { name: /Siguiente: Aprobación de diseño/i });
    expect(nextLink).toHaveAttribute('href', '/construction/design-baseline');

    expect(screen.getByText('Fase de Construcción · Paso 2 de 5')).toBeInTheDocument();
  });

  it('renders KPI metrics badges for the conceptual model in the version card', async () => {
    render(
      <TestProviders>
        <ConceptualModelPage />
      </TestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText('MC-001')).toBeInTheDocument();
    });

    // KPI metrics: 2 entidades de dominio, 4 atributos, 1 relación conceptual, 2 módulos cubiertos
    expect(screen.getByText('2 entidades de dominio')).toBeInTheDocument();
    expect(screen.getByText('4 atributos')).toBeInTheDocument();
    expect(screen.getByText('1 relación conceptual')).toBeInTheDocument();
    expect(screen.getByText('2 módulos cubiertos')).toBeInTheDocument();
  });

  it('toggles detail and renders ConceptualModelDetail with entities and relationships', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <ConceptualModelPage />
      </TestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText('MC-001')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole('button', { name: /Ver detalle/i });
    await user.click(toggleBtn);

    // Should display the banner and entity cards
    expect(screen.getByText('Modelo Conceptual de Dominio')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cliente', level: 5 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pedido', level: 5 })).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('total')).toBeInTheDocument();
    expect(screen.getByText('Un cliente puede realizar múltiples pedidos.')).toBeInTheDocument();
  });
});
