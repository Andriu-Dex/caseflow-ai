import { describe, expect, it, vi } from 'vitest';
import { stopWaitingForApi, triggerApiRun } from './trigger-api-run';

const refused = () =>
  Promise.reject(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }));
const init = { method: 'POST' };

describe('triggerApiRun', () => {
  it('waits for an API that is restarting and then triggers the run once', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(refused)
      .mockImplementationOnce(refused)
      .mockResolvedValue({ ok: true });
    await expect(triggerApiRun('http://api/run', init, fetchImpl, [0, 0, 0])).resolves.toEqual({
      ok: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('never repeats a request the API may have received', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }));
    await expect(triggerApiRun('http://api/run', init, fetchImpl, [0, 0])).rejects.toThrow(
      'fetch failed',
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('gives up when the API stays down', async () => {
    const fetchImpl = vi.fn().mockImplementation(refused);
    await expect(triggerApiRun('http://api/run', init, fetchImpl, [0, 0])).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  // Last: shutting down is final for the whole process.
  it('stops waiting as soon as the worker shuts down', async () => {
    const fetchImpl = vi.fn().mockImplementation(refused);
    const run = triggerApiRun('http://api/run', init, fetchImpl, [60_000]);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    stopWaitingForApi();
    await expect(run).rejects.toThrow('fetch failed');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
