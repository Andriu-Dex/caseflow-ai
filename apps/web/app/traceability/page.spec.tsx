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
const toastWarning = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { warning: toastWarning, error: vi.fn(), success: vi.fn() } }));
const getDiagram = vi.fn().mockResolvedValue({
  source: 'flowchart TD\n  v1["RF-001: Registrar pedido"]',
  sourceFormat: 'MERMAID_FLOWCHART',
  svg: '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>',
});
// Defaults to "nothing stale" (behavior unaffected) unless a test overrides
// it with mockResolvedValueOnce before rendering.
const getStaleness = vi.fn().mockResolvedValue({
  projectId: 'p1',
  generatedAt: new Date().toISOString(),
  entries: [],
});
const analyzeImpact = vi.fn().mockResolvedValue({
  directlyAffected: ['v2'],
  transitivelyAffected: [],
  recommendedReviewOrder: ['v2'],
});

vi.mock('../../lib/api', () => ({
  api: {
    traceability: {
      get: (...args: unknown[]) => getGraph(...args),
      getDiagram: (...args: unknown[]) => getDiagram(...args),
      diagramPngUrl: (projectId: string) => `/projects/${projectId}/traceability/diagram/png`,
    },
    staleness: { get: (...args: unknown[]) => getStaleness(...args) },
    impactAnalysis: { analyze: (...args: unknown[]) => analyzeImpact(...args) },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
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
    await waitFor(() => expect(screen.getByRole('button', { name: /CU-001/ })).toBeInTheDocument());
    expect(screen.getByText('Requisitos')).toBeInTheDocument();
    expect(screen.getByText('Casos de uso')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar artefacto'), 'PEDIDO EN EL SISTEMA');
    expect(screen.queryByRole('button', { name: /RF-001/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CU-001/ })).toBeInTheDocument();
  });
});

describe('TraceabilityPage — related-node navigation', () => {
  it('selects a related node when clicking it in the upstream/downstream lists', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /RF-001/ }));
    // "Aguas abajo" for RF-001 lists CU-001; clicking it should select CU-001,
    // whose own "Aguas arriba" then lists RF-001 back instead of the "sin
    // conocimiento de origen" placeholder.
    await screen.findByText(/Sin conocimiento\/artefacto de origen registrado/i);
    const downstreamButtons = screen.getAllByRole('button', { name: /CU-001/ });
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
    await screen.findByRole('button', { name: /RF-001/ });
    expect(getDiagram).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Grafo' }));
    await waitFor(() => expect(getDiagram).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('Ver código fuente')).toBeInTheDocument();
  });
});

describe('TraceabilityPage — links the drawing leaves out', () => {
  it('warns once, in a toast, when the graph has more links than the drawing holds', async () => {
    const user = userEvent.setup();
    getDiagram.mockResolvedValueOnce({
      source: 'flowchart TD',
      sourceFormat: 'MERMAID_FLOWCHART',
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>',
      omittedLinks: 500,
    });
    renderPage();
    await screen.findByRole('button', { name: /RF-001/ });
    await user.click(screen.getByRole('tab', { name: 'Grafo' }));
    await waitFor(() => expect(toastWarning).toHaveBeenCalledTimes(1));
    expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining('faltan 500'));
  });
});

describe('TraceabilityPage — staleness (closes the "verá señalado en cada paso" promise)', () => {
  it('shows a success banner when nothing is potentially stale', async () => {
    renderPage();
    expect(
      await screen.findByText(/Sin incidencias de trazabilidad pendientes/i),
    ).toBeInTheDocument();
  });

  it('flags an affected version, explains why and links to the fix', async () => {
    getStaleness.mockResolvedValueOnce({
      projectId: 'p1',
      generatedAt: new Date().toISOString(),
      entries: [
        {
          artifactId: 'a1',
          artifactVersionId: 'v1',
          artifactType: 'REQUIREMENT',
          code: 'RF-001',
          versionNumber: 1,
          status: 'APPROVED',
          impactState: 'POTENTIALLY_AFFECTED',
          reasons: [
            {
              type: 'CONTEXT_POTENTIALLY_AFFECTED',
              sourceArtifactId: 'ctx',
              sourceVersionId: 'v2',
              message: 'Generado desde CTX-001 v1, que tiene conocimiento más reciente.',
            },
          ],
        },
      ],
    });
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText(/Hay 1 versión que podría estar desactualizada/i),
    ).toBeInTheDocument();
    const rf001Button = await screen.findByRole('button', { name: /RF-001/ });
    expect(rf001Button).toHaveAccessibleName(/Posiblemente desactualizado|v1/i);

    await user.click(rf001Button);
    expect(
      await screen.findByText(/Generado desde CTX-001 v1, que tiene conocimiento más reciente/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/se resolverá al actualizar y aprobar de nuevo el Contexto del Proyecto/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al Contexto del Proyecto' })).toHaveAttribute(
      'href',
      '/context',
    );

    // The reason links to its source node (CU-001, id "v2") when that node
    // is present in the graph, so the user can jump straight to it.
    await user.click(
      screen.getByRole('button', {
        name: /Generado desde CTX-001 v1, que tiene conocimiento más reciente/i,
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /CU-001/ }).length).toBeGreaterThan(0),
    );
  });
});

describe('TraceabilityPage — impact analysis', () => {
  // Regression: the reset-on-select effect used to depend on the whole
  // useMutation() result object, which is a new object every render. That
  // made the effect rerun — and reset the mutation — on every render,
  // including the one its own `mutate()` call triggers, so the result (or
  // even the pending state) never stayed visible long enough to see.
  it('shows the result after clicking "Analizar impacto de este cambio", and keeps showing it', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /RF-001/ }));
    await user.click(screen.getByRole('button', { name: 'Analizar impacto de este cambio' }));

    expect(analyzeImpact).toHaveBeenCalledWith('p1', 'v1');
    expect(await screen.findByText(/Afectados Directamente/)).toBeInTheDocument();
    // Give any further scheduled effects a chance to run, then confirm the
    // result is still there — not reset back to the empty "Analizar" button.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText(/Afectados Directamente/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Analizar impacto de este cambio' }),
    ).not.toBeInTheDocument();
  });

  it('resets the previous result when a different artifact is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /RF-001/ }));
    await user.click(screen.getByRole('button', { name: 'Analizar impacto de este cambio' }));
    await screen.findByText(/Afectados Directamente/);

    await user.click(screen.getAllByRole('button', { name: /CU-001/ })[0]!);
    expect(screen.queryByText(/Afectados Directamente/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Analizar impacto de este cambio' }),
    ).toBeInTheDocument();
  });
});

describe('TraceabilityPage — enhanced UX and controls', () => {
  it('clears search input when clicking the clear button', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /CU-001/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /RF-001/ })).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Buscar artefacto');
    await user.type(searchInput, 'CU-001');

    expect(screen.queryByRole('button', { name: /RF-001/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CU-001/ })).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: 'Limpiar búsqueda' });
    await user.click(clearBtn);

    expect(screen.getByRole('button', { name: /RF-001/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CU-001/ })).toBeInTheDocument();
  });

  it('collapses and expands artifact categories', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /RF-001/ })).toBeInTheDocument());

    const requirementsCategory = screen.getByRole('button', { name: /Requisitos/i });
    await user.click(requirementsCategory);

    expect(screen.queryByRole('button', { name: /RF-001/ })).not.toBeInTheDocument();

    await user.click(requirementsCategory);
    expect(screen.getByRole('button', { name: /RF-001/ })).toBeInTheDocument();
  });

  it('filters to only stale artifacts and renders KPI overview cards', async () => {
    getStaleness.mockResolvedValueOnce({
      projectId: 'p1',
      generatedAt: new Date().toISOString(),
      entries: [
        {
          artifactId: 'a1',
          artifactVersionId: 'v1',
          artifactType: 'REQUIREMENT',
          code: 'RF-001',
          versionNumber: 1,
          status: 'APPROVED',
          impactState: 'POTENTIALLY_AFFECTED',
          reasons: [],
        },
      ],
    });

    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Nodos en Grafo')).toBeInTheDocument();
    expect(screen.getByText('Enlaces / Relaciones')).toBeInTheDocument();
    expect(screen.getByText('Salud de Coherencia')).toBeInTheDocument();

    const staleFilterBtn = await screen.findByRole('button', {
      name: /Solo desactualizados/i,
    });
    await user.click(staleFilterBtn);

    expect(screen.getByRole('button', { name: /RF-001/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /CU-001/ })).not.toBeInTheDocument();
  });
});
