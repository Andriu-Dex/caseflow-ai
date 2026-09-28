import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TraceabilityPage from './page';
import { TestProviders } from '../../lib/test-utils';

const requirementNode = {
  id: 'v1',
  artifactId: 'a1',
  artifactType: 'REQUIREMENT' as const,
  code: 'RF-001',
  versionNumber: 1,
  status: 'APPROVED' as const,
  origin: 'MANUAL' as const,
  title: 'Registrar pedido',
  isCurrent: true,
  generation: null,
  generator: null,
};
const useCaseNode = {
  id: 'v2',
  artifactId: 'a2',
  artifactType: 'USE_CASE' as const,
  code: 'CU-001',
  versionNumber: 1,
  status: 'APPROVED' as const,
  origin: 'AI_GENERATED' as const,
  title: 'Registrar pedido en el sistema',
  isCurrent: true,
  generation: null,
  generator: null,
};

const getGraph = vi.fn().mockResolvedValue({
  projectId: 'p1',
  generatedAt: new Date().toISOString(),
  nodes: [requirementNode, useCaseNode],
  edges: [{ type: 'REQUIREMENT_SOURCE_FOR_USE_CASE', fromId: 'v1', toId: 'v2' }],
  truncated: true,
});
const getDiagram = vi.fn().mockResolvedValue({
  source: 'flowchart TD\n  v1["RF-001: Registrar pedido"]',
  sourceFormat: 'MERMAID_FLOWCHART',
  svg: '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>',
});

vi.mock('../../lib/api', () => ({
  api: {
    traceability: {
      get: (...args: unknown[]) => getGraph(...args),
      getDiagram: (...args: unknown[]) => getDiagram(...args),
      diagramPngUrl: (projectId: string) => `/projects/${projectId}/traceability/diagram/png`,
    },
  },
  ApiError: class ApiError extends Error {},
}));

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  getGraph.mockClear();
  getDiagram.mockClear();
});

function renderPage() {
  return render(
    <TestProviders>
      <TraceabilityPage />
    </TestProviders>,
  );
}

describe('TraceabilityPage (behavior 16: truncation notice)', () => {
  it('shows a clear notice when the graph was bounded, never implying completeness', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/fue acotado por tamaño/i)).toBeInTheDocument());
  });
});

describe('TraceabilityPage — search and grouping', () => {
  it('groups artifacts by type and filters by code/title, accent- and case-insensitively', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('CU-001 — Registrar pedido en el sistema')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Requisitos \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Casos de uso \(1\)/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar artefacto'), 'PEDIDO EN EL SISTEMA');
    expect(screen.queryByText('RF-001 — Registrar pedido')).not.toBeInTheDocument();
    expect(screen.getByText('CU-001 — Registrar pedido en el sistema')).toBeInTheDocument();
  });
});

describe('TraceabilityPage — related-node navigation', () => {
  it('selects a related node when clicking it in the upstream/downstream lists', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('RF-001 — Registrar pedido'));
    // "Aguas abajo" for RF-001 lists CU-001; clicking it should select CU-001,
    // whose own "Aguas arriba" then lists RF-001 back instead of the "sin
    // conocimiento de origen" placeholder.
    await screen.findByText(/Sin conocimiento\/artefacto de origen registrado/i);
    const downstreamButtons = screen.getAllByText(/CU-001/);
    await user.click(downstreamButtons[downstreamButtons.length - 1]!);
    await waitFor(() =>
      expect(
        screen.queryByText(/Sin conocimiento\/artefacto de origen registrado/i),
      ).not.toBeInTheDocument(),
    );
  });
});

describe('TraceabilityPage — diagram view', () => {
  it('only fetches the rendered diagram after switching to the Grafo tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('RF-001 — Registrar pedido');
    expect(getDiagram).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Grafo' }));
    await waitFor(() => expect(getDiagram).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('Ver código fuente')).toBeInTheDocument();
  });
});
