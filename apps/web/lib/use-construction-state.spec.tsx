import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from './test-utils';
import { useConstructionState } from './use-construction-state';
const mocks = vi.hoisted(() => ({ plans: vi.fn(), runs: vi.fn(), validation: vi.fn() }));
vi.mock('./api', () => ({
  api: {
    structuredAnalysis: {
      list: (p: string, k: string) =>
        k === 'IMPLEMENTATION_PLAN' ? mocks.plans() : Promise.resolve({ items: [] }),
    },
    generationRuns: {
      list: () => mocks.runs(),
      sandboxRuns: (...args: unknown[]) => mocks.validation(...args),
    },
    designBaselines: { list: async () => ({ items: [] }) },
  },
  restoreSession: vi.fn(),
}));
const generated = {
  id: 'current',
  status: 'GENERATED',
  implementationPlanVersionId: 'plan-current',
  createdAt: '2026-11-08T00:00:00Z',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.plans.mockResolvedValue({
    items: [
      { version: { id: 'plan-current', status: 'APPROVED', createdAt: '2026-11-08T00:00:00Z' } },
      { version: { id: 'plan-old', status: 'APPROVED', createdAt: '2026-10-01T00:00:00Z' } },
    ],
  });
  mocks.runs.mockResolvedValue({ items: [generated] });
  mocks.validation.mockResolvedValue({
    items: [{ attemptNumber: 1, status: 'READY', snapshotId: 'snapshot' }],
  });
});
describe('current construction completion', () => {
  it('accepts only a ready snapshot for the latest generation of the latest approved plan', async () => {
    const { result } = renderHook(() => useConstructionState('project'), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.hasValidatedCode).toBe(true);
    expect(mocks.validation).toHaveBeenCalledWith('project', 'current');
  });
  it.each(['WORKING_COPY', 'FAILED', 'GENERATING', 'QUEUED'])(
    'does not reuse older success for a newer %s run, even archived',
    async (status) => {
      mocks.runs.mockResolvedValue({
        items: [
          {
            ...generated,
            id: 'new',
            status,
            archivedAt: '2026-11-09T00:00:00Z',
            createdAt: '2026-11-08T01:00:00Z',
          },
          generated,
        ],
      });
      const { result } = renderHook(() => useConstructionState('project'), {
        wrapper: TestProviders,
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.data?.hasValidatedCode).toBe(false);
      expect(mocks.validation).not.toHaveBeenCalled();
    },
  );
  it('does not reuse a generated project from a previous plan', async () => {
    mocks.runs.mockResolvedValue({
      items: [{ ...generated, implementationPlanVersionId: 'plan-old' }],
    });
    const { result } = renderHook(() => useConstructionState('project'), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.hasValidatedCode).toBe(false);
    expect(mocks.validation).not.toHaveBeenCalled();
  });
  it.each(['RUNNING', 'ERROR', 'VALIDATION_FAILED'])(
    'rejects a latest %s validation over an older ready result',
    async (status) => {
      mocks.validation.mockResolvedValue({
        items: [
          { attemptNumber: 2, status, snapshotId: null },
          { attemptNumber: 1, status: 'READY', snapshotId: 'old-snapshot' },
        ],
      });
      const { result } = renderHook(() => useConstructionState('project'), {
        wrapper: TestProviders,
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.data?.hasValidatedCode).toBe(false);
    },
  );
  it('does not claim validated software when READY lacks its snapshot', async () => {
    mocks.validation.mockResolvedValue({
      items: [{ attemptNumber: 1, status: 'READY', snapshotId: null }],
    });
    const { result } = renderHook(() => useConstructionState('project'), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.hasValidatedCode).toBe(false);
  });
});
