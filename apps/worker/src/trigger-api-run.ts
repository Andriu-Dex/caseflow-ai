// The worker only triggers runs that apps/api owns. In development the API
// restarts on every file change, and on startup it re-queues pending jobs
// before it listens: a refused connection means the API never received the
// request, so waiting and trying again is safe. Any other failure (an HTTP
// error, a timeout, a dropped connection) is reported to BullMQ as is.
export const API_RECONNECT_DELAYS_MS = [2_000, 4_000, 8_000, 15_000, 30_000, 60_000];

const refused = (error: unknown) =>
  error instanceof Error && (error.cause as { code?: string } | undefined)?.code === 'ECONNREFUSED';

// Set when the worker shuts down: a run waiting for the API gives up at once
// instead of holding the shutdown for minutes.
const shutdown = new AbortController();
export const stopWaitingForApi = () => shutdown.abort();

export async function triggerApiRun(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  delays: readonly number[] = API_RECONNECT_DELAYS_MS,
): Promise<Response> {
  for (const delay of delays) {
    try {
      return await fetchImpl(url, init);
    } catch (error) {
      if (!refused(error) || shutdown.signal.aborted) throw error;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        shutdown.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
      if (shutdown.signal.aborted) throw error;
    }
  }
  return fetchImpl(url, init);
}
