import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UseCaseGenerationPanel } from './use-case-generation-panel';

const mocks = vi.hoisted(() => ({
  latest: vi.fn(),
  start: vi.fn(),
  generation: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../lib/api', () => ({
  api: {
    useCases: {
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

const job = (status: string, ids = ['rv1', 'rv2']) => ({
  id: 'job1',
  projectId: 'p1',
  status,
  completedBatches: 2,
  totalBatches: 5,
  outputChars: 0,
  generationId: status === 'COMPLETED' ? 'gen1' : null,
  errorMessage: status === 'FAILED' ? 'Proveedor no disponible.' : null,
  requirementVersionIds: ids,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
const mount = (ids = ['rv1', 'rv2'], onCompleted = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UseCaseGenerationPanel
        projectId="p1"
        requirementVersionIds={ids}
        onCompleted={onCompleted}
      />
    </QueryClientProvider>,
  );
  return onCompleted;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.latest.mockResolvedValue({ job: null });
});

describe('UseCaseGenerationPanel', () => {
  it('starts a background job for the chosen requirements and shows its progress', async () => {
    mocks.start.mockResolvedValue(job('RUNNING'));
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Generar con 2 requisitos' }));
    expect(mocks.start).toHaveBeenCalledWith('p1', ['rv1', 'rv2']);
    expect(
      await screen.findByRole('progressbar', { name: 'Lotes de casos de uso validados' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generando…' })).toBeDisabled();
  });

  it('offers to resume a failed run of the same selection and says why it stopped', async () => {
    mocks.latest.mockResolvedValue({ job: job('FAILED') });
    mount();
    expect(await screen.findByRole('button', { name: 'Reanudar generación' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Proveedor no disponible.');
  });

  it('starts a new run, not a resume, when the selection changed', async () => {
    mocks.latest.mockResolvedValue({ job: job('FAILED', ['rv9']) });
    mount();
    expect(await screen.findByRole('button', { name: 'Generar con 2 requisitos' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Reanudar generación' })).not.toBeInTheDocument();
  });

  it('hands over the proposals of a finished job that still has some to review', async () => {
    mocks.latest.mockResolvedValue({ job: job('COMPLETED') });
    mocks.generation.mockResolvedValue({
      id: 'gen1',
      candidates: [{ id: 'c1', acceptedArtifactId: null }],
    });
    const onCompleted = mount();
    await waitFor(() =>
      expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ id: 'gen1' })),
    );
  });

  it('does not reopen a generation whose proposals were all accepted', async () => {
    mocks.latest.mockResolvedValue({ job: job('COMPLETED') });
    mocks.generation.mockResolvedValue({
      id: 'gen1',
      candidates: [{ id: 'c1', acceptedArtifactId: 'a1' }],
    });
    const onCompleted = mount();
    await waitFor(() => expect(mocks.generation).toHaveBeenCalled());
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
