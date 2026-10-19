import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SourcesPage from './page';
import { TestProviders } from '../../lib/test-utils';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  capabilities: vi.fn(),
  getText: vi.fn(),
  submitManualTranscript: vi.fn(),
  fetchBlob: vi.fn(),
  reportJob: vi.fn(),
  generateReport: vi.fn(),
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
      list: async (...args: unknown[]) => withCounts(await mocks.list(...args)),
      capabilities: (...args: unknown[]) => mocks.capabilities(...args),
      getText: (...args: unknown[]) => mocks.getText(...args),
      submitManualTranscript: (...args: unknown[]) => mocks.submitManualTranscript(...args),
      reportJob: (...args: unknown[]) => mocks.reportJob(...args),
      generateReport: (...args: unknown[]) => mocks.generateReport(...args),
      downloadUrl: (projectId: string, id: string) =>
        `/projects/${projectId}/sources/${id}/download`,
    },
    staleness: { get: vi.fn(async () => ({ projectId: 'p1', generatedAt: '', entries: [] })) },
    readiness: { get: vi.fn(async () => ({ stages: [] })) },
  },
  fetchBlob: (...args: unknown[]) => mocks.fetchBlob(...args),
  downloadFile: vi.fn(),
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const pdfSource = (patch: Record<string, unknown> = {}, processing: unknown = null) => ({
  id: 'src1',
  projectId: 'p1',
  code: 'SRC-001',
  createdAt: new Date().toISOString(),
  archivedAt: null,
  hasApprovedHistory: false,
  version: {
    id: 'v1',
    versionNumber: 1,
    status: 'DRAFT',
    origin: 'MANUAL',
    createdAt: new Date().toISOString(),
  },
  processing,
  source: {
    title: 'Acta de reunión',
    sourceKind: 'PDF',
    purpose: 'Acuerdos',
    businessArea: null,
    description: '',
    originalFilename: 'acta.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    contentHash: 'hash',
    language: null,
    extractionState: 'EXTRACTED',
    extractionFailureReason: null,
    hasExtractedText: true,
    hasReport: false,
    ...patch,
  },
});

const renderPage = () =>
  render(
    <TestProviders>
      <SourcesPage />
    </TestProviders>,
  );

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  mocks.list.mockResolvedValue({ items: [] });
  mocks.capabilities.mockResolvedValue({
    ocr: true,
    transcription: false,
    maxFileSizeBytes: 25 * 1024 * 1024,
    maxPdfPages: 100,
    maxScannedPdfPages: 10,
    maxExtractedCharacters: 50_000,
  });
  mocks.fetchBlob.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
  mocks.reportJob.mockResolvedValue({ job: null });
  mocks.getText.mockResolvedValue({ sourceVersionId: 'v1', text: 'Texto' });
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('Sources — adding a source', () => {
  it('switches the kind to match the chosen file and warns before uploading', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(/Escriba el contenido directamente/)).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText('Archivo (opcional)'),
      new File(['ID3'], 'entrevista.mp3', { type: 'audio/mpeg' }),
    );
    expect(await screen.findByRole('combobox', { name: 'Tipo de fuente' })).toHaveTextContent(
      'Audio',
    );
    // This installation cannot transcribe: say so before uploading.
    expect(screen.getByText(/La transcripción automática no está disponible/)).toBeInTheDocument();
  });
});

describe('Sources — the creation form', () => {
  it('folds behind a button once the project has sources', async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue({ items: [pdfSource()] });
    renderPage();
    const add = await screen.findByRole('button', { name: 'Agregar fuente' });
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    await user.click(add);
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
  });

  it('is open with an explanation while there are no sources', async () => {
    renderPage();
    expect(await screen.findByText(/Agregue la primera para comenzar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });
});

describe('Sources — reviewing a source', () => {
  it('explains why the text could not be obtained', async () => {
    mocks.list.mockResolvedValue({
      items: [
        pdfSource(
          { extractionState: 'PENDING', hasExtractedText: false },
          {
            id: 'job',
            status: 'FAILED',
            processor: 'PDF',
            errorMessage: 'No se pudo obtener texto legible del archivo.',
            failureReason: 'TOO_MANY_SCANNED_PAGES',
            updatedAt: new Date().toISOString(),
          },
        ),
      ],
    });
    renderPage();
    expect(await screen.findByText('No se pudo procesar')).toBeInTheDocument();
    expect(screen.getByText('El PDF tiene más de 10 páginas escaneadas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('shows the original next to its text and saves a correction in place', async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue({ items: [pdfSource()] });
    mocks.getText.mockResolvedValue({ sourceVersionId: 'v1', text: 'Acuerdo 1: compar pan' });
    mocks.submitManualTranscript.mockResolvedValue(pdfSource());
    renderPage();
    expect(await screen.findByText('Texto extraído')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }));
    // The detail opens as a reading view of the text.
    expect(await screen.findByRole('article', { name: 'el texto de la fuente' })).toHaveTextContent(
      'Acuerdo 1: compar pan',
    );
    await user.click(screen.getByRole('button', { name: 'Ver original lado a lado' }));

    // Full screen: the original and its text in the same dialog.
    const dialog = await screen.findByRole('dialog', { name: /Acta de reunión/ });
    expect(
      within(dialog).getByRole('article', { name: 'el texto de la fuente' }),
    ).toBeInTheDocument();
    expect(await within(dialog).findByTitle('Archivo original: acta.pdf')).toHaveAttribute(
      'src',
      'blob:preview',
    );
    expect(mocks.fetchBlob).toHaveBeenCalledWith('/projects/p1/sources/src1/download');

    await user.click(await screen.findByRole('button', { name: 'Editar texto' }));
    const editor = screen.getByLabelText('Texto de la fuente');
    await user.clear(editor);
    await user.type(editor, 'Acuerdo 1: comprar pan');
    expect(screen.getByText(/Cambios sin guardar/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mocks.submitManualTranscript).toHaveBeenCalledWith(
        'p1',
        'src1',
        'Acuerdo 1: comprar pan',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Sources — the report of a long source (DEC-127)', () => {
  const reportJob = (patch: Record<string, unknown>) => ({
    job: {
      id: 'report-job',
      sourceVersionId: 'v1',
      status: 'RUNNING',
      totalParts: 5,
      completedParts: 2,
      errorMessage: null,
      candidate: null,
      updatedAt: new Date().toISOString(),
      ...patch,
    },
  });

  async function openReport(user: ReturnType<typeof userEvent.setup>) {
    mocks.list.mockResolvedValue({ items: [pdfSource()] });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    await user.click(screen.getByText('Reporte de la fuente'));
  }

  it('starts the report in the background and shows its progress by parts', async () => {
    const user = userEvent.setup();
    mocks.generateReport.mockResolvedValue(reportJob({}));
    await openReport(user);
    await user.click(await screen.findByRole('button', { name: 'Generar reporte con IA' }));
    expect(mocks.generateReport).toHaveBeenCalledWith('p1', 'src1');
    expect(await screen.findByText(/parte 3 de 5/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avance del reporte' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    expect(
      screen.queryByRole('button', { name: 'Generar reporte con IA' }),
    ).not.toBeInTheDocument();
  });

  it('says why it failed and resumes from the next part', async () => {
    const user = userEvent.setup();
    mocks.reportJob.mockResolvedValue(
      reportJob({
        status: 'FAILED',
        errorMessage: 'Se agotó la cuota diaria del proveedor de IA.',
      }),
    );
    await openReport(user);
    expect(
      await screen.findByText(/Se agotó la cuota diaria.*continuará desde la parte 3/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar el reporte' })).toBeInTheDocument();
  });
});
