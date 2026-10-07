import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DockerSetupAssistant } from './docker-setup-assistant';
import { TestProviders } from '../lib/test-utils';

const status = vi.hoisted(() => vi.fn());
vi.mock('../lib/api', () => ({
  api: { construction: { sandboxStatus: () => status() } },
  restoreSession: vi.fn(),
}));

describe('DockerSetupAssistant', () => {
  it('guides the installation and checks again until Docker is available', async () => {
    const user = userEvent.setup();
    status.mockResolvedValueOnce({ available: false }).mockResolvedValue({ available: true });
    render(
      <TestProviders>
        <DockerSetupAssistant />
      </TestProviders>,
    );
    expect(await screen.findByText(/Docker es necesario/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Linux' }));
    expect(screen.getByText(/grupo «docker»/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /verificar de nuevo/ }));
    await waitFor(() => expect(screen.queryByText(/Docker es necesario/)).not.toBeInTheDocument());
  });
});
