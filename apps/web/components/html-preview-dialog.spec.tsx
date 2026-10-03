import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HtmlPreviewDialog } from './html-preview-dialog';
import { TestProviders } from '../lib/test-utils';

const mocks = vi.hoisted(() => ({ fetchBlob: vi.fn(), downloadFile: vi.fn() }));

vi.mock('../lib/api', () => ({
  fetchBlob: (...args: unknown[]) => mocks.fetchBlob(...args),
  downloadFile: (...args: unknown[]) => mocks.downloadFile(...args),
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

beforeEach(() => {
  // jsdom's Blob lacks text(); browsers implement it.
  mocks.fetchBlob.mockResolvedValue({ text: async () => '<h1>Documento</h1>' });
  mocks.downloadFile.mockResolvedValue(undefined);
});

function renderDialog() {
  return render(
    <TestProviders>
      <HtmlPreviewDialog
        open
        onOpenChange={() => undefined}
        url="/projects/p1/export?format=html"
        filename="proyecto-p1.html"
        title="Documento del proyecto"
      />
    </TestProviders>,
  );
}

describe('HtmlPreviewDialog', () => {
  it('renders the exported HTML in a fully sandboxed iframe', async () => {
    renderDialog();
    const frame = await screen.findByTitle('Documento del proyecto');
    expect(frame).toHaveAttribute('srcdoc', '<h1>Documento</h1>');
    // No scripts, no same-origin access: project content is untrusted.
    expect(frame).toHaveAttribute('sandbox', '');
  });

  it('downloads the same document from inside the preview', async () => {
    renderDialog();
    const button = await screen.findByRole('button', { name: /Descargar HTML/ });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(mocks.downloadFile).toHaveBeenCalledWith(
      '/projects/p1/export?format=html',
      'proyecto-p1.html',
    );
  });

  it('shows a safe error instead of a blank frame when the preview fails', async () => {
    mocks.fetchBlob.mockRejectedValue(new Error('500'));
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No se pudo generar la vista previa/,
    );
  });
});
