import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SourcesPage from './page';
import { TestProviders } from '../../lib/test-utils';

const baseSource = {
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
    title: 'Entrevista con administración de Restaurante Mateos',
    sourceKind: 'NOTES' as const,
    purpose: 'Identificar cómo se gestionan las sucursales.',
    businessArea: null,
    description: 'Contenido de la entrevista.',
    originalFilename: null,
    mimeType: null,
    sizeBytes: null,
    contentHash: null,
    language: null,
    extractionState: 'MANUAL' as const,
    hasExtractedText: false,
    hasReport: false,
  },
};

const mocks = vi.hoisted(() => ({
  listSources: vi.fn(),
  getStaleness: vi.fn(),
  restore: vi.fn(),
}));

// The API answers with the page plus its total and counts (DEC-137).
const withCounts = (page: {
  items: { archivedAt?: string | null }[];
  total?: number;
  counts?: object;
}) => {
  const archived = page.items.filter((item) => item.archivedAt).length;
  return {
    ...page,
    total: page.total ?? page.items.length,
    counts: page.counts ?? {
      ACTIVE: page.items.length - archived,
      ARCHIVED: archived,
      ALL: page.items.length,
    },
  };
};

vi.mock('../../lib/api', () => ({
  api: {
    sources: {
      list: async (...args: unknown[]) => withCounts(await mocks.listSources(...args)),
      restore: (...args: unknown[]) => mocks.restore(...args),
    },
    staleness: { get: (...args: unknown[]) => mocks.getStaleness(...args) },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  mocks.listSources.mockResolvedValue({ items: [baseSource] });
  mocks.getStaleness.mockResolvedValue({
    projectId: 'p1',
    generatedAt: new Date().toISOString(),
    entries: [],
  });
});

function renderPage() {
  return render(
    <TestProviders>
      <SourcesPage />
    </TestProviders>,
  );
}

describe('SourcesPage — outbound staleness (closes the loop Home/Trazabilidad/Contexto started)', () => {
  it('says nothing when nothing downstream is affected by this source', async () => {
    renderPage();
    await screen.findByText('SRC-001 v2');
    expect(screen.queryByText('Pendiente de incorporar')).not.toBeInTheDocument();
  });

  it('flags the source and explains what to do when the Context has not incorporated it yet', async () => {
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

    expect(await screen.findByText('Pendiente de incorporar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }));
    expect(
      await screen.findByText(
        'SRC-001 tiene una versión aprobada más reciente (v2) que la vinculada al contexto (v1).',
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Ir al Contexto del Proyecto' });
    expect(link).toHaveAttribute('href', '/context');
  });

  it('never flags a source that is not cited by any staleness reason', async () => {
    mocks.listSources.mockResolvedValue({
      items: [{ ...baseSource, id: 'srcB', code: 'SRC-002' }],
    });
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
              sourceArtifactId: 'some-other-source',
              sourceVersionId: 'other-v2',
              message: 'SRC-999 tiene una versión aprobada más reciente.',
            },
          ],
        },
      ],
    });
    renderPage();
    await screen.findByText('SRC-002 v2');
    await waitFor(() => expect(mocks.getStaleness).toHaveBeenCalled());
    expect(screen.queryByText('Pendiente de incorporar')).not.toBeInTheDocument();
  });
});

// DEC-137: archived sources are hidden by default; past one page, paging.
describe('SourcesPage — filters and paging', () => {
  it('asks for the active sources first and pages past twenty', async () => {
    mocks.listSources.mockResolvedValue({
      items: [baseSource],
      total: 25,
      counts: { ACTIVE: 25, ARCHIVED: 3, ALL: 28 },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SRC-001 v2');
    expect(mocks.listSources).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ status: 'ACTIVE', limit: 20, offset: 0 }),
    );
    expect(screen.getByRole('option', { name: 'Archivadas (3)' })).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    await waitFor(() =>
      expect(mocks.listSources).toHaveBeenLastCalledWith(
        'p1',
        expect.objectContaining({ offset: 20 }),
      ),
    );
    await user.selectOptions(screen.getByLabelText('Estado de la fuente'), 'ARCHIVED');
    await waitFor(() =>
      expect(mocks.listSources).toHaveBeenLastCalledWith(
        'p1',
        expect.objectContaining({ status: 'ARCHIVED', offset: 0 }),
      ),
    );
  });

  it('hides paging within one page and offers to restore an archived source', async () => {
    mocks.listSources.mockResolvedValue({
      items: [{ ...baseSource, archivedAt: new Date().toISOString() }],
    });
    mocks.restore.mockResolvedValue(baseSource);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SRC-001 v2');
    expect(screen.queryByRole('navigation', { name: 'Paginación de fuentes' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Ver detalle/ }));
    await user.click(await screen.findByRole('button', { name: 'Más acciones' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Restaurar' }));
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith('p1', 'srcA'));
  });
});
