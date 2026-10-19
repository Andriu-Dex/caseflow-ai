import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PageHeading } from './page-heading';
import { TestProviders } from '../lib/test-utils';

let currentPathname = '/sources';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

const mocks = vi.hoisted(() => ({
  readinessGet: vi.fn(),
  structuredAnalysisList: vi.fn(),
  designBaselinesList: vi.fn(),
  generationRunsList: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: {
    readiness: { get: (...args: unknown[]) => mocks.readinessGet(...args) },
    structuredAnalysis: { list: (...args: unknown[]) => mocks.structuredAnalysisList(...args) },
    designBaselines: { list: (...args: unknown[]) => mocks.designBaselinesList(...args) },
    generationRuns: { list: (...args: unknown[]) => mocks.generationRunsList(...args) },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

beforeEach(() => {
  mocks.readinessGet.mockReset().mockResolvedValue({
    ready: false,
    stages: [{ key: 'SOURCES', satisfied: true }],
  });
  mocks.structuredAnalysisList.mockReset().mockResolvedValue({ items: [] });
  mocks.designBaselinesList.mockReset().mockResolvedValue({ items: [] });
  mocks.generationRunsList.mockReset().mockResolvedValue({ items: [] });
});

describe('PageHeading for planning pipeline', () => {
  it('renders step number of 13 and completion banner when satisfied', async () => {
    currentPathname = '/sources';
    render(
      <TestProviders>
        <PageHeading title="Fuentes del proyecto" projectId="p1" />
      </TestProviders>,
    );

    expect(screen.getByText(/Paso 1 de 13/i)).toBeInTheDocument();
    expect(screen.getByText('Fuentes del proyecto')).toBeInTheDocument();

    const banner = await screen.findByRole('link', {
      name: /Este paso está completo — continuar a Contexto del proyecto/i,
    });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('href', '/context');
  });
});

describe('PageHeading for construction pipeline', () => {
  it('renders construction step subtitle (Paso 1 de 5) on generation-plan', async () => {
    currentPathname = '/construction/generation-plan';
    render(
      <TestProviders>
        <PageHeading title="Plan de generación" projectId="p1" />
      </TestProviders>,
    );

    expect(screen.getByText(/Fase de Construcción · Paso 1 de 5/i)).toBeInTheDocument();
    expect(screen.getByText('Plan de generación')).toBeInTheDocument();
    expect(screen.queryByText(/Este paso está completo/i)).not.toBeInTheDocument();
  });

  it('renders top completion banner linking to conceptual-model when generation plan is approved', async () => {
    currentPathname = '/construction/generation-plan';
    mocks.structuredAnalysisList.mockImplementation((_pid, kind) => {
      if (kind === 'GENERATION_PLAN') {
        return Promise.resolve({
          items: [{ version: { status: 'APPROVED' } }],
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(
      <TestProviders>
        <PageHeading title="Plan de generación" projectId="p1" />
      </TestProviders>,
    );

    const banner = await screen.findByRole('link', {
      name: /Este paso está completo — continuar a Modelo conceptual/i,
    });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('href', '/construction/conceptual-model');
  });

  it('renders top completion banner on conceptual-model linking to design-baseline when approved', async () => {
    currentPathname = '/construction/conceptual-model';
    mocks.structuredAnalysisList.mockImplementation((_pid, kind) => {
      if (kind === 'CONCEPTUAL_DOMAIN_MODEL') {
        return Promise.resolve({
          items: [{ version: { status: 'APPROVED' } }],
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(
      <TestProviders>
        <PageHeading title="Modelo conceptual" projectId="p1" />
      </TestProviders>,
    );

    expect(screen.getByText(/Fase de Construcción · Paso 2 de 5/i)).toBeInTheDocument();
    const banner = await screen.findByRole('link', {
      name: /Este paso está completo — continuar a Aprobación de diseño/i,
    });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('href', '/construction/design-baseline');
  });

  it('renders top completion banner on design-baseline linking to implementation-plan when baseline exists', async () => {
    currentPathname = '/construction/design-baseline';
    mocks.designBaselinesList.mockResolvedValue({
      items: [{ id: 'b1', code: 'DB-001' }],
    });

    render(
      <TestProviders>
        <PageHeading title="Aprobación de diseño" projectId="p1" />
      </TestProviders>,
    );

    expect(screen.getByText(/Fase de Construcción · Paso 3 de 5/i)).toBeInTheDocument();
    const banner = await screen.findByRole('link', {
      name: /Este paso está completo — continuar a Plan de implementación/i,
    });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('href', '/construction/implementation-plan');
  });

  it('renders top completion banner on implementation-plan linking to generation-runs when approved', async () => {
    currentPathname = '/construction/implementation-plan';
    mocks.structuredAnalysisList.mockImplementation((_pid, kind) => {
      if (kind === 'IMPLEMENTATION_PLAN') {
        return Promise.resolve({
          items: [{ version: { status: 'APPROVED' } }],
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(
      <TestProviders>
        <PageHeading title="Plan de implementación" projectId="p1" />
      </TestProviders>,
    );

    expect(screen.getByText(/Fase de Construcción · Paso 4 de 5/i)).toBeInTheDocument();
    const banner = await screen.findByRole('link', {
      name: /Este paso está completo — continuar a Generación de código/i,
    });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('href', '/construction/generation-runs');
  });

  it('renders top completion banner on generation-runs linking to readiness when code generated', async () => {
    currentPathname = '/construction/generation-runs';
    mocks.generationRunsList.mockResolvedValue({
      items: [{ id: 'run-1', status: 'GENERATED' }],
    });

    render(
      <TestProviders>
        <PageHeading title="Generación de código" projectId="p1" />
      </TestProviders>,
    );

    expect(screen.getByText(/Fase de Construcción · Paso 5 de 5/i)).toBeInTheDocument();
    const banner = await screen.findByRole('link', {
      name: /Este paso está completo — continuar a Preparación \/ Exportar/i,
    });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('href', '/readiness');
  });
});
