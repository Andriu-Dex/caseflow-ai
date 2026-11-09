import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
require('reflect-metadata');

const { NestFactory } = require('@nestjs/core');
const { AppModule } = await import('../apps/api/dist/app.module.js');
const { GenerationRunsService } =
  await import('../apps/api/dist/construction/generation-runs.service.js');
const { FrontendDesignService } =
  await import('../apps/api/dist/construction/frontend-design.service.js');
const { PrismaService } = await import('../apps/api/dist/database/prisma.service.js');
const { AuditService } = await import('../apps/api/dist/audit/audit.service.js');
const { findTargetTemplate } = await import('../packages/domain/dist/index.js');

const PROJECT_ID = '4584e81d-42f3-4501-b0c8-58bac5f7253c';
const USER_ID = 'ba282b91-44c5-48bc-9d59-b94fc23513e2';
const PLAN_V24_ID = 'd40dd6e1-7de2-4e8d-b066-7bef396dbf8b';
const TEMPLATE_IDENTIFIER = 'CASEFLOW_WEB_TS_V1';

async function main() {
  console.log('====================================================');
  console.log('Starting Direct Official Candidate Generation Run');
  console.log('Project:', PROJECT_ID);
  console.log('Plan Version:', PLAN_V24_ID);
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const generationRuns = app.get(GenerationRunsService);
  const frontendDesign = app.get(FrontendDesignService);
  const audit = app.get(AuditService);

  // Add rich live progress logging
  let routeIdx = 0;
  if (frontendDesign) {
    const origFindFirst = prisma.generatedFile.findFirst.bind(prisma.generatedFile);
    prisma.generatedFile.findFirst = async (args) => {
      const res = await origFindFirst(args);
      const p = args?.where?.path;
      if (p?.startsWith?.('docs/presentations/') && res) {
        routeIdx++;
        console.log(`[Cache HIT] [${routeIdx}/81] Presentation loaded from cache: ${p}`);
      }
      return res;
    };
  }

  if (frontendDesign?.ai?.generateStructured) {
    const orig = frontendDesign.ai.generateStructured.bind(frontendDesign.ai);
    frontendDesign.ai.generateStructured = async (params) => {
      routeIdx++;
      let screenInfo = 'unknown';
      try {
        const payload = JSON.parse(params.messages[0].content);
        screenInfo = `"${payload.screen?.name}" (${payload.screen?.path || payload.bindings?.route?.path})`;
      } catch {
        // ignore parse error
      }
      console.log(`[AI Calling] [${routeIdx}/81] Adapting screen ${screenInfo}...`);
      const startAi = Date.now();
      const res = await orig(params);
      const latency = Math.round((Date.now() - startAi) / 1000);
      const limitations = res.data?.limitations || [];
      console.log(
        `[AI Result] [${routeIdx}/81] Screen ${screenInfo} adapted in ${latency}s - Limitations: ${limitations.length}`,
      );
      if (limitations.length) {
        console.warn('Limitations details:', limitations);
      }
      return res;
    };
  }

  const planVersion = await prisma.artifactVersion.findFirstOrThrow({
    where: { id: PLAN_V24_ID, projectId: PROJECT_ID },
    include: { structuredAnalysisDetail: true },
  });

  const planContent = planVersion.structuredAnalysisDetail.content;
  const designBaselineId = planContent.designBaselineId;
  console.log('Using Design Baseline:', designBaselineId);
  console.log('Total routes in plan:', planContent.routes.length);

  const template = findTargetTemplate(TEMPLATE_IDENTIFIER);
  if (!template) throw new Error('Target template not found');

  console.log('Creating generation run record in database...');
  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.generationRun.create({
      data: {
        projectId: PROJECT_ID,
        implementationPlanVersionId: PLAN_V24_ID,
        designBaselineId,
        targetTemplateIdentifier: template.identifier,
        targetTemplateVersion: template.version,
        createdByUserId: USER_ID,
        status: 'QUEUED',
      },
    });

    await audit.record(
      {
        projectId: PROJECT_ID,
        actorUserId: USER_ID,
        action: 'GENERATION_RUN_STARTED',
        entityType: 'GENERATION_RUN',
        entityId: created.id,
        metadata: {
          implementationPlanVersionId: PLAN_V24_ID,
          designBaselineId,
          mode: 'DIRECT_OFFICIAL_CANDIDATE',
        },
      },
      tx,
    );

    return created;
  });

  console.log(`Generation run created: ${run.id} (status: QUEUED)`);
  console.log('Invoking generationRuns.runJob in-process...');
  const start = Date.now();

  const heartbeat = setInterval(async () => {
    try {
      await prisma.generationRun.updateMany({
        where: { id: run.id, status: 'GENERATING' },
        data: { startedAt: new Date() },
      });
    } catch {
      // heartbeat best effort
    }
  }, 2000);

  try {
    await generationRuns.runJob(PROJECT_ID, run.id);
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`runJob finished in ${elapsed}s!`);

    const finalRun = await prisma.generationRun.findUnique({
      where: { id: run.id },
      include: { _count: { select: { files: true } } },
    });

    console.log('====================================================');
    console.log('FINAL RUN RESULT:');
    console.log('ID:', finalRun.id);
    console.log('Status:', finalRun.status);
    console.log('Files count:', finalRun._count.files);
    console.log('Error message:', finalRun.errorMessage);
    console.log('Warnings count:', finalRun.warnings?.length);
    console.log('====================================================');
  } catch (err) {
    console.error('runJob threw unhandled exception:', err);
  } finally {
    clearInterval(heartbeat);
    await app.close();
  }
}

main().catch((err) => {
  console.error('Fatal error in direct run script:', err);
  process.exit(1);
});
