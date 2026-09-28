import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';

describe('Worker AppModule', () => {
  it('initializes a Nest application context without an HTTP server', async () => {
    // AppModule now wires a real BullMQ Worker (MockupJobsModule), which
    // connects to Redis on construction — this smoke test therefore needs
    // the integration environment (REDIS_URL, INTERNAL_JOBS_SECRET), same as
    // apps/api's mockup queue.
    process.env.INTERNAL_JOBS_SECRET ??= 'test-internal-jobs-secret';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();

    expect(moduleRef).toBeDefined();

    await moduleRef.close();
  });
});
