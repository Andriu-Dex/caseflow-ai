import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useFailureToast } from './use-failure-toast';

vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }));

const active = (status: string) => status === 'RUNNING';
const failed = (status: string) => status === 'FAILED';
const job = (status: string, errorMessage: string | null = null) => [
  { id: 'job', status, errorMessage },
];

describe('useFailureToast', () => {
  beforeEach(() => vi.mocked(toast.warning).mockClear());

  it('warns when a watched job goes from running to failed', () => {
    const { rerender } = renderHook(
      ({ items }) => useFailureToast(items, active, failed, 'Falló.'),
      { initialProps: { items: job('RUNNING') } },
    );
    rerender({ items: job('FAILED', 'Se interrumpió porque el servidor se reinició.') });
    expect(toast.warning).toHaveBeenCalledExactlyOnceWith(
      'Se interrumpió porque el servidor se reinició.',
    );
  });

  it('stays quiet about failures that were already there when the page loaded', () => {
    const { rerender } = renderHook(
      ({ items }) => useFailureToast(items, active, failed, 'Falló.'),
      { initialProps: { items: job('FAILED') } },
    );
    rerender({ items: job('FAILED') });
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
