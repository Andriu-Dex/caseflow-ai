import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContextPage from './page';
import { TestProviders } from '../../lib/test-utils';

const existingContext = {
  artifactId: 'ctxA',
  projectId: 'p1',
  type: 'PROJECT_CONTEXT' as const,
  code: 'CTX-001',
  version: {
    id: 'ctx-v1',
    versionNumber: 1,
    status: 'APPROVED' as const,
    origin: 'MANUAL' as const,
    createdAt: new Date().toISOString(),
  },
  problemStatement: 'Restaurante Mateos gestiona ventas de forma dispersa.',
  objective: 'Centralizar la gestión operativa de las sucursales.',
  scopeItems: [],
  actors: [{ id: 'act1', position: 0, name: 'Administrador', description: null }],
  needs: [{ id: 'n1', position: 0, description: 'Registrar ventas por sucursal' }],
  constraints: [],
  businessRules: [],
  additionalContext: null,
  // Still linked to SRC-001 v1 — a newer v2 exists in the sources fixture.
  sources: [{ id: 'srcA', versionId: 'src-v1', code: 'SRC-001', title: 'Entrevista' }],
};

// api.sources.list always reflects the latest APPROVED version per source —
// here that's v2, newer than what existingContext still links to.
const sourcesFixture = {
  items: [
    {
      id: 'srcA',
      projectId: 'p1',
      code: 'SRC-001',
      createdAt: new Date().toISOString(),
      archivedAt: null,
      hasApprovedHistory: true,
      version: {
        id: 'src-v2',
        versionNumber: 2,
        status: 'APPROVED' as const,
        origin: 'MANUAL' as const,
        createdAt: new Date().toISOString(),
      },
      processing: null,
      source: {
        title: 'Entrevista',
        sourceKind: 'INTERVIEW_TRANSCRIPT' as const,
        purpose: 'p',
        businessArea: null,
        description: 'd',
        originalFilename: null,
        mimeType: null,
        sizeBytes: null,
        contentHash: null,
        language: null,
        extractionState: 'COMPLETED' as const,
        hasExtractedText: true,
        hasReport: false,
      },
    },
  ],
};

const mocks = vi.hoisted(() => ({
  getCurrent: vi.fn(),
  listSources: vi.fn(),
  getStaleness: vi.fn(),
  createVersion: vi.fn(),
  generate: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    context: {
      getCurrent: (...args: unknown[]) => mocks.getCurrent(...args),
      createVersion: (...args: unknown[]) => mocks.createVersion(...args),
      generate: (...args: unknown[]) => mocks.generate(...args),
      transition: vi.fn(),
    },
    sources: { list: (...args: unknown[]) => mocks.listSources(...args) },
    staleness: { get: (...args: unknown[]) => mocks.getStaleness(...args) },
  },
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly status?: number,
    ) {
      super(message);
    }
  },
  restoreSession: vi.fn(),
}));

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  window.sessionStorage.clear();
  mocks.getCurrent.mockResolvedValue(existingContext);
  mocks.listSources.mockResolvedValue(sourcesFixture);
  mocks.getStaleness.mockResolvedValue({
    projectId: 'p1',
    generatedAt: new Date().toISOString(),
    entries: [],
  });
  mocks.createVersion.mockResolvedValue(existingContext);
});

function renderPage() {
  return render(
    <TestProviders>
      <ContextPage />
    </TestProviders>,
  );
}

describe('ContextPage — prefilling "Crear nueva versión"', () => {
  it('starts the new-version form from the approved content instead of blank', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Crear nueva versión' }));

    expect(
      await screen.findByDisplayValue('Restaurante Mateos gestiona ventas de forma dispersa.'),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('Centralizar la gestión operativa de las sucursales.'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Administrador')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Registrar ventas por sucursal')).toBeInTheDocument();
  });

  it('pre-checks the newest approved version of an already-linked source', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Crear nueva versión' }));

    const checkbox = await screen.findByRole('checkbox', { name: /SRC-001.*versión 2/ });
    await waitFor(() => expect(checkbox).toBeChecked());
  });
});

describe('ContextPage — list field parsing', () => {
  // Regression: the read view already renders each line as a bulleted <li>,
  // so a leading "- " the user typed by habit (very natural in a plain
  // textarea) used to double up visually as "• - texto".
  it('strips a leading dash/bullet the user typed, instead of storing it literally', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Crear nueva versión' }));

    const needsField = await screen.findByLabelText('Necesidades (una por línea)');
    await user.clear(needsField);
    await user.type(needsField, '- Registrar ventas{enter}* Consultar inventario');
    await user.click(screen.getByRole('button', { name: 'Guardar nueva versión' }));

    await waitFor(() => expect(mocks.createVersion).toHaveBeenCalled());
    const payload = mocks.createVersion.mock.calls[0]![1];
    expect(payload.needs).toEqual([
      { description: 'Registrar ventas' },
      { description: 'Consultar inventario' },
    ]);
  });

  it('keeps the scope of the previous version and reads "Nombre: responsabilidades" actors', async () => {
    mocks.getCurrent.mockResolvedValue({
      ...existingContext,
      scopeItems: [
        { id: 's1', position: 0, type: 'OUT_OF_SCOPE', description: 'Facturación electrónica' },
      ],
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Crear nueva versión' }));

    const actorsField = await screen.findByLabelText(/^Actores/);
    await user.clear(actorsField);
    await user.type(actorsField, 'Cajero: registra las ventas{enter}Administrador');
    await user.click(screen.getByRole('button', { name: 'Guardar nueva versión' }));

    await waitFor(() => expect(mocks.createVersion).toHaveBeenCalled());
    const payload = mocks.createVersion.mock.calls[0]![1];
    expect(payload.actors).toEqual([
      { name: 'Cajero', description: 'registra las ventas' },
      { name: 'Administrador' },
    ]);
    expect(payload.scopeItems).toEqual([
      { type: 'OUT_OF_SCOPE', description: 'Facturación electrónica' },
    ]);
  });
});

describe('ContextPage — staleness', () => {
  it('shows nothing when the current context is up to date', async () => {
    renderPage();
    await screen.findByText('Fuentes vinculadas');
    expect(
      screen.queryByText(/no incluye el conocimiento aprobado más reciente/i),
    ).not.toBeInTheDocument();
  });

  it('warns with the exact reason and opens the form from the banner link', async () => {
    mocks.getStaleness.mockResolvedValue({
      projectId: 'p1',
      generatedAt: new Date().toISOString(),
      entries: [
        {
          artifactId: 'ctxA',
          artifactVersionId: 'ctx-v1',
          artifactType: 'PROJECT_CONTEXT',
          code: 'CTX-001',
          versionNumber: 1,
          status: 'APPROVED',
          impactState: 'NEWER_APPROVED_KNOWLEDGE_AVAILABLE',
          reasons: [
            {
              type: 'NEWER_APPROVED_SOURCE_VERSION',
              sourceArtifactId: 'srcA',
              sourceVersionId: 'src-v2',
              message:
                'SRC-001 tiene una versión aprobada más reciente (v2) que la vinculada al contexto (v1).',
            },
          ],
        },
      ],
    });
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText(/no incluye el conocimiento aprobado más reciente/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'SRC-001 tiene una versión aprobada más reciente (v2) que la vinculada al contexto (v1).',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Crear nueva versión ahora' }));
    expect(
      await screen.findByDisplayValue('Restaurante Mateos gestiona ventas de forma dispersa.'),
    ).toBeInTheDocument();
  });
});
describe('ContextPage — AI proposal', () => {
  it('keeps the proposal when the user leaves the page while it is generated', async () => {
    const { ApiError } = await import('../../lib/api');
    mocks.getCurrent.mockRejectedValue(new ApiError('No existe', 404));
    let finish!: (candidate: unknown) => void;
    mocks.generate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    const first = renderPage();
    await user.click(await screen.findByRole('button', { name: /Generar con IA/ }));
    // The user goes to another page before the AI answers.
    first.unmount();
    finish({
      id: 'c1',
      projectId: 'p1',
      aiRunId: 'r1',
      content: {
        problemStatement: 'Las ventas se anotan en papel.',
        objective: 'Registrar ventas en línea.',
        additionalContext: null,
        actors: [{ name: 'Cajero', description: 'Registra las ventas' }],
        scopeItems: [
          { type: 'IN_SCOPE', description: 'Ventas' },
          { type: 'OUT_OF_SCOPE', description: 'Facturación electrónica' },
        ],
        needs: ['Registrar ventas'],
        constraints: [],
        businessRules: [],
      },
      sourceVersionIds: [],
      reportSourceVersionIds: [],
      partialSourceVersionIds: [],
      createdAt: new Date().toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    renderPage();
    expect(await screen.findByDisplayValue('Las ventas se anotan en papel.')).toBeInTheDocument();
    // The proposal fills actor roles and both scope lists too (DEC-131).
    expect(screen.getByDisplayValue('Cajero: Registra las ventas')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ventas')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Facturación electrónica')).toBeInTheDocument();
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
});
