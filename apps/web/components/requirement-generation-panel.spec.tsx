import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequirementGenerationPanel } from './requirement-generation-panel';
const mocks = vi.hoisted(() => ({
  latest: vi.fn(),
  start: vi.fn(),
  generation: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../lib/api', () => ({
  api: {
    requirements: {
      latestGeneration: (...args: unknown[]) => mocks.latest(...args),
      startGeneration: (...args: unknown[]) => mocks.start(...args),
      generation: (...args: unknown[]) => mocks.generation(...args),
    },
  },
  ApiError: class extends Error {},
}));
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mocks.error(...args), info: vi.fn() },
}));
const job = (status = 'RUNNING') => ({
  id: 'job1',
  projectId: 'p1',
  sourceContextVersionId: 'ctx1',
  status,
  completedBatches: 1,
  totalBatches: 4,
  outputChars: 120,
  generationId: status === 'COMPLETED' ? 'gen1' : null,
  errorMessage: status === 'FAILED' ? 'Stream interrupted' : null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
const mount = (contextVersionId: string | null = 'ctx1', onCompleted = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <RequirementGenerationPanel
        projectId="p1"
        contextVersionId={contextVersionId}
        onCompleted={onCompleted}
      />
    </QueryClientProvider>,
  );
  return { ...view, client, onCompleted };
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.latest.mockResolvedValue({ job: null });
  mocks.generation.mockResolvedValue({
    id: 'gen1',
    candidates: [{ id: 'candidate', acceptedArtifactId: null }],
  });
});
describe('Requirement generation progress', () => {
  it('starts a scoped background job and shows real validated batch progress', async () => {
    mocks.start.mockResolvedValue(job());
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Generar con IA' }));
    expect(mocks.start).toHaveBeenCalledWith('p1', 'ctx1');
    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText(/1 de 4 lotes validados/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generando…' })).toBeDisabled();
  });
  it('reloads the running job and delivers complete proposals only once', async () => {
    mocks.latest.mockResolvedValue({ job: job() });
    const view = mount();
    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    act(() => {
      view.client.setQueryData(['requirement-generation-job', 'p1'], { job: job('COMPLETED') });
    });
    await waitFor(() => expect(view.onCompleted).toHaveBeenCalledOnce());
    expect(mocks.generation).toHaveBeenCalledWith('p1', 'gen1');
    act(() => {
      view.client.setQueryData(['requirement-generation-job', 'p1'], {
        job: { ...job('COMPLETED'), updatedAt: new Date().toISOString() },
      });
    });
    expect(view.onCompleted).toHaveBeenCalledOnce();
  });
  it('resumes failed work and does not load results from another context', async () => {
    mocks.latest.mockResolvedValue({ job: job('FAILED') });
    mocks.start.mockResolvedValue(job());
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Reanudar generación' }));
    expect(mocks.start).toHaveBeenCalledWith('p1', 'ctx1');
  });
  it('does not revive proposals from an earlier approved context', async () => {
    mocks.latest.mockResolvedValue({ job: job('COMPLETED') });
    mount('ctx2');
    await screen.findByRole('button', { name: 'Generar con IA' });
    await waitFor(() => expect(mocks.latest).toHaveBeenCalled());
    expect(mocks.generation).not.toHaveBeenCalled();
  });
  it('keeps result-loading recovery separate from starting another generation', async () => {
    mocks.latest.mockResolvedValue({ job: job('COMPLETED') });
    mocks.generation
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ id: 'gen1', candidates: [{ id: 'c' }] });
    const view = mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Cargar propuestas' }));
    await waitFor(() => expect(view.onCompleted).toHaveBeenCalledOnce());
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
