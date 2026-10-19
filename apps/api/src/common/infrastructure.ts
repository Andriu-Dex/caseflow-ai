import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { loadStorageConfig } from '@caseflow-ai/config';
import {
  DisabledStorageProvider,
  FilesystemStorageProvider,
  S3StorageProvider,
  type StorageProvider,
} from '@caseflow-ai/integrations';

const logger = new Logger('Infrastructure');

// Object storage: S3-compatible (web edition) or a folder on disk (desktop
// edition, STORAGE_DIR, DEC-120).
export function createStorageProvider(): StorageProvider {
  if (process.env.STORAGE_DIR) return new FilesystemStorageProvider(process.env.STORAGE_DIR);
  const config = loadStorageConfig(process.env);
  return config.configured ? new S3StorageProvider(config) : new DisabledStorageProvider();
}

// What services need from a queue.
export interface JobQueue<T> {
  add(name: string, payload: T): Promise<unknown>;
  close(): Promise<void>;
}

// Desktop edition (DEC-120): no Redis. A job is posted right away to the same
// authenticated internal endpoint the worker calls, after the current request
// finishes. Every job already records a terminal status, so nothing hangs;
// what is lost is BullMQ's automatic retry.
class InProcessQueue<T> implements JobQueue<T> {
  constructor(private readonly runUrl: (payload: T) => string) {}
  async add(_name: string, payload: T): Promise<void> {
    setImmediate(() => {
      const base = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
      fetch(`${base}${this.runUrl(payload)}`, {
        method: 'POST',
        headers: { 'x-internal-jobs-secret': process.env.INTERNAL_JOBS_SECRET ?? '' },
      })
        .then((response) => {
          if (!response.ok) logger.warn(`In-process job failed with status ${response.status}.`);
        })
        .catch((error: unknown) =>
          logger.warn(
            `In-process job could not start: ${error instanceof Error ? error.message : error}`,
          ),
        );
    });
  }
  async close(): Promise<void> {}
}

// BullMQ over Redis (web edition), or in-process when
// CASEFLOW_QUEUE_MODE=in-process (desktop edition).
export function createJobQueue<T>(
  name: string,
  runUrl: (payload: T) => string,
  redisOptions: Record<string, unknown> = {},
): JobQueue<T> {
  if (process.env.CASEFLOW_QUEUE_MODE === 'in-process') return new InProcessQueue(runUrl);
  return new Queue<T>(name, {
    connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379', ...redisOptions },
  }) as unknown as JobQueue<T>;
}
