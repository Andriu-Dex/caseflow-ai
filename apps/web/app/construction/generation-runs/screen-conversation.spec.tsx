import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../../lib/test-utils';
import { ScreenConversation } from './screen-conversation';

const mocks = vi.hoisted(() => ({ conversation: vi.fn(), add: vi.fn(), restore: vi.fn() }));
vi.mock('../../../lib/api', () => ({
  api: {
    designBaselines: {
      screenConversation: (...args: unknown[]) => mocks.conversation(...args),
      addScreenRequest: (...args: unknown[]) => mocks.add(...args),
      restoreScreenRequest: (...args: unknown[]) => mocks.restore(...args),
    },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const item = (id: string, note: string, instructions: string[], current: boolean) => ({
  id,
  note,
  instructions,
  authorName: 'Ana',
  createdAt: '2026-11-20T00:00:00.000Z',
  current,
});

function open() {
  render(
    <TestProviders>
      <ScreenConversation projectId="p1" routePath="/items" title="Artículos" />
    </TestProviders>,
  );
  return userEvent.setup();
}

// ADR-030: a conversation per generated screen.
describe('ScreenConversation', () => {
  beforeEach(() => {
    mocks.conversation.mockReset();
    mocks.add.mockReset();
    mocks.restore.mockReset();
  });

  it('sends a request for the screen and shows it as the current version', async () => {
    mocks.conversation.mockResolvedValue({ items: [] });
    mocks.add.mockResolvedValue({ items: [item('r1', 'Tabla arriba', ['Tabla arriba'], true)] });
    const user = open();
    await user.click(screen.getByRole('button', { name: 'Pedir cambios' }));
    expect(await screen.findByText(/sigue el diseño del boceto/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nueva petición'), 'Tabla arriba');
    await user.click(screen.getByRole('button', { name: 'Enviar petición' }));
    expect(mocks.add).toHaveBeenCalledWith('p1', '/items', 'Tabla arriba');
    expect(await screen.findByText('Actual')).toBeInTheDocument();
    expect(screen.getByLabelText('Nueva petición')).toHaveValue('');
  });

  it('goes back to an earlier version or to the mockup design', async () => {
    const items = [
      item('r1', 'Tabla arriba', ['Tabla arriba'], false),
      item('r2', 'Menos texto', ['Tabla arriba', 'Menos texto'], true),
    ];
    mocks.conversation.mockResolvedValue({ items });
    mocks.restore.mockResolvedValue({ items });
    const user = open();
    await user.click(screen.getByRole('button', { name: 'Pedir cambios' }));
    await user.click(await screen.findByRole('button', { name: 'Volver' }));
    expect(mocks.restore).toHaveBeenCalledWith('p1', '/items', 'r1');
    await user.click(screen.getByRole('button', { name: 'Volver al diseño del boceto' }));
    await waitFor(() => expect(mocks.restore).toHaveBeenLastCalledWith('p1', '/items', null));
  });
});
