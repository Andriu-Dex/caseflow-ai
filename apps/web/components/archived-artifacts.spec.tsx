import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArchivedArtifacts } from './archived-artifacts';
import { TestProviders } from '../lib/test-utils';

const mocks = vi.hoisted(() => ({
  listArchived: vi.fn(),
  restore: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('../lib/api', () => ({
  api: {
    artifacts: {
      listArchived: (...args: unknown[]) => mocks.listArchived(...args),
      restore: (...args: unknown[]) => mocks.restore(...args),
    },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const item = {
  id: 'a1',
  type: 'CLASS_DIAGRAM',
  code: 'DC-001',
  title: 'Diagrama viejo',
  status: 'APPROVED',
  versionNumber: 1,
  archivedAt: '2026-10-16T12:00:00.000Z',
};

const renderList = (onRestored = vi.fn()) =>
  render(
    <TestProviders>
      <ArchivedArtifacts projectId="p1" types={['CLASS_DIAGRAM']} onRestored={onRestored} />
    </TestProviders>,
  );

beforeEach(() => vi.resetAllMocks());

describe('ArchivedArtifacts', () => {
  it('shows nothing when nothing is archived', async () => {
    mocks.listArchived.mockResolvedValue({ items: [] });
    const { container } = renderList();
    await waitFor(() => expect(mocks.listArchived).toHaveBeenCalledWith('p1', ['CLASS_DIAGRAM']));
    expect(container).toBeEmptyDOMElement();
  });

  it('lists what was archived and restores it, warning when it competes with an approved one', async () => {
    const user = userEvent.setup();
    const onRestored = vi.fn();
    mocks.listArchived.mockResolvedValue({ items: [item] });
    mocks.restore.mockResolvedValue({
      restored: true,
      warning: 'Ya hay otro diagrama aprobado (DC-003).',
    });
    renderList(onRestored);

    await user.click(await screen.findByRole('button', { name: /Archivados \(1\)/ }));
    expect(screen.getByText('Diagrama viejo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restaurar DC-001' }));

    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(mocks.restore).toHaveBeenCalledWith('p1', 'a1');
    expect(mocks.toast.success).toHaveBeenCalledWith('DC-001 restaurado.');
    expect(mocks.toast.warning).toHaveBeenCalledWith('Ya hay otro diagrama aprobado (DC-003).');
  });

  it('does not warn when there is nothing to warn about', async () => {
    const user = userEvent.setup();
    mocks.listArchived.mockResolvedValue({ items: [item] });
    mocks.restore.mockResolvedValue({ restored: true, warning: null });
    renderList();
    await user.click(await screen.findByRole('button', { name: /Archivados/ }));
    await user.click(screen.getByRole('button', { name: 'Restaurar DC-001' }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
    expect(mocks.toast.warning).not.toHaveBeenCalled();
  });
});
