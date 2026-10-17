import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiagramViewer } from './diagram-viewer';

const mocks = vi.hoisted(() => ({ downloadFile: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error {},
  downloadFile: (...args: unknown[]) => mocks.downloadFile(...args),
}));

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g/></svg>';

describe('DiagramViewer — PNG download', () => {
  it('shows that the image is being prepared and ignores a second click until it arrives', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    mocks.downloadFile.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    render(
      <DiagramViewer
        svg={svg}
        source="flowchart TD"
        sourceFormat="MERMAID_FLOWCHART"
        code="DC-001"
        pngUrl="/api/diagram.png"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Descargar PNG' }));
    const busy = await screen.findByRole('button', { name: 'Preparando PNG…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await user.click(busy);
    expect(mocks.downloadFile).toHaveBeenCalledTimes(1);
    expect(mocks.downloadFile).toHaveBeenCalledWith('/api/diagram.png', 'DC-001.png');

    finish();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Descargar PNG' })).not.toBeDisabled(),
    );
  });
});
