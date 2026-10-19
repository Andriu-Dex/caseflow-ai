import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DismissibleHint } from './dismissible-hint';

const mocks = vi.hoisted(() => ({ userId: 'user-1' as string | null }));
vi.mock('../lib/api', () => ({ currentUserId: () => mocks.userId }));

const hint = (
  <>
    <p role="alert">El contexto está desactualizado.</p>
    <DismissibleHint id="baselines-intro" label="¿Qué es una línea base?">
      Una captura fija de lo aprobado.
    </DismissibleHint>
    <button type="button">Fuera</button>
  </>
);

beforeEach(() => {
  window.localStorage.clear();
  mocks.userId = 'user-1';
});

describe('DismissibleHint (E3)', () => {
  it('shows once, closes with X and does not come back, without hiding alerts', async () => {
    const user = userEvent.setup();
    const { unmount } = render(hint);
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('Una captura fija de lo aprobado.');
    // Help is never an alert: the real alert stays visible next to it.
    expect(screen.getByRole('alert')).toHaveTextContent('desactualizado');
    expect(screen.getByRole('button', { name: '¿Qué es una línea base?' })).toHaveAttribute(
      'aria-describedby',
      note.id,
    );

    await user.click(screen.getByRole('button', { name: 'Cerrar ayuda' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '¿Qué es una línea base?' })).toHaveFocus();
    unmount();

    render(hint);
    await act(async () => undefined);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    // Still available on demand.
    await user.click(screen.getByRole('button', { name: '¿Qué es una línea base?' }));
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('closes with Escape or a click outside, and remembers it per user', async () => {
    const user = userEvent.setup();
    const { unmount } = render(hint);
    await screen.findByRole('note');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    unmount();

    mocks.userId = 'user-2';
    render(hint);
    await screen.findByRole('note');
    await user.click(screen.getByRole('button', { name: 'Fuera' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('caseflow.dismissedHints.user-2')!)).toEqual([
      'baselines-intro',
    ]);
  });
});
