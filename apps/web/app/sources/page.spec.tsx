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
}));

vi.mock('../../lib/api', () => ({
  api: {
    sources: { list: (...args: unknown[]) => mocks.listSources(...args) },
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
