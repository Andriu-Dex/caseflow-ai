// Shown on a job that was running when the API process stopped (a restart
// or a crash): the work was cut off, nothing failed in it.
export const INTERRUPTED_BY_RESTART =
  'Se interrumpió porque el servidor se reinició. Puede reintentarlo.';

// A job's process records a heartbeat while it works, so another process
// starting up (a second API, a script, a watch-mode restart of another
// instance) only marks jobs whose heartbeat stopped as interrupted.
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_STALE_MS = 90_000;

export function startHeartbeat(beat: () => Promise<unknown>): () => void {
  const timer = setInterval(() => void beat().catch(() => undefined), HEARTBEAT_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

// Rows whose heartbeat is missing or older than the stale limit.
export const staleHeartbeat = (now: Date) => ({
  OR: [
    { heartbeatAt: null },
    { heartbeatAt: { lt: new Date(now.getTime() - HEARTBEAT_STALE_MS) } },
  ],
});
