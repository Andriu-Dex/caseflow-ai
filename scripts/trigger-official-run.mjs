import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
require('reflect-metadata');

const { NestFactory } = require('@nestjs/core');
const { AppModule } = await import('../apps/api/dist/app.module.js');
const { GenerationRunsService } =
  await import('../apps/api/dist/construction/generation-runs.service.js');
const { PrismaService } = await import('../apps/api/dist/database/prisma.service.js');

const PROJECT_ID = '4584e81d-42f3-4501-b0c8-58bac5f7253c';
const USER_ID = 'ba282b91-44c5-48bc-9d59-b94fc23513e2';
const PLAN_V24_ID = 'd40dd6e1-7de2-4e8d-b066-7bef396dbf8b';

async function main() {
  console.log('Booting application context to start official generation run...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const generationRuns = app.get(GenerationRunsService);

  console.log('Starting generation run with Plan v24...');
  const runResponse = await generationRuns.start(PROJECT_ID, USER_ID, PLAN_V24_ID);
  console.log('Generation run started:', runResponse.id, 'status:', runResponse.status);

  // Close context so that only the main API on port 3001 processes requests
  await app.close();

  // Now monitor progress
  const monitorPrisma = new PrismaService({});

  const runId = runResponse.id;
  const start = Date.now();

  console.log(`Monitoring run ${runId}...`);
  while (true) {
    await new Promise((r) => setTimeout(r, 5000));
    const current = await monitorPrisma.generationRun.findUnique({
      where: { id: runId },
      include: { _count: { select: { files: true } } },
    });

    if (!current) {
      console.log('Run not found in database!');
      break;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(
      `[+${elapsed}s] Run ${runId}: status=${current.status}, files=${current._count.files}`,
    );

    if (current.status === 'QUEUED' && elapsed > 10) {
      console.log('Job still queued after 10s, triggering internal callback directly...');
      try {
        const resp = await fetch(
          `http://localhost:3001/projects/${PROJECT_ID}/construction-jobs/generation-run/${runId}/run`,
          {
            method: 'POST',
            headers: {
              'x-internal-jobs-secret': process.env.INTERNAL_JOBS_SECRET || '',
            },
          },
        );
        console.log('Internal trigger HTTP response:', resp.status);
      } catch (err) {
        console.warn('Failed to call internal trigger:', err.message);
      }
    }

    if (current.status !== 'QUEUED' && current.status !== 'GENERATING') {
      console.log('=== TERMINAL STATUS REACHED ===');
      console.log('Final status:', current.status);
      console.log('Started at:', current.startedAt);
      console.log('Finished at:', current.finishedAt);
      console.log('Files count:', current._count.files);
      console.log('Failure reason:', current.failureReason);
      console.log('Error message:', current.errorMessage);
      console.log('Warnings:', current.warnings);
      break;
    }
  }

  await monitorPrisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error in trigger script:', err);
  process.exit(1);
});
