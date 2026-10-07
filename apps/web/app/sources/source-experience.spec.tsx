import { render, screen, waitFor } from '@testing-library/react';
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
}));

vi.mock('../../lib/api', () => ({
  api: {
    sources: {
      list: (...args: unknown[]) => mocks.list(...args),
      capabilities: (...args: unknown[]) => mocks.capabilities(...args),
      getText: (...args: unknown[]) => mocks.getText(...args),
      submitManualTranscript: (...args: unknown[]) => mocks.submitManualTranscript(...args),
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

    expect(await screen.findByTitle('Archivo original: acta.pdf')).toHaveAttribute(
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
  });
});
