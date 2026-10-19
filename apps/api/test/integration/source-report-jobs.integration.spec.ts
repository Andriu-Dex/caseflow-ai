import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AIError,
  AIOrchestrator,
  FallbackAIProvider,
  PromptRegistry,
  type AIProvider,
  type AIProviderRequest,
} from '@caseflow-ai/ai';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { SourceContentExtractor } from '../../src/sources/source-content-extractor';
import { SourcesService } from '../../src/sources/sources.service';
import { FakeStorageProvider } from '@caseflow-ai/integrations';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

// DEC-127: a long source's report is generated in the background, part by
// part, keeping every part so a failed job resumes where it stopped.
const prompts = ['source-report.generate', 'source-report.summarize-part', 'source-report.merge'];
const report = (summary: string) => ({
  summary,
  actors: [],
  businessConcepts: [],
  candidateBusinessRules: [],
  candidateConstraints: [],
  needs: [],
  importantFacts: [],
  ambiguities: [],
});

// Answers each request with a report naming what it was asked for; can be
// told to fail on a given call.
function scriptedProvider(failOnCall?: number): AIProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: 'fake',
    calls,
    async generateStructured(request: AIProviderRequest) {
      const input = JSON.parse(request.messages[0]!.content) as {
        part?: number;
        partialReports?: unknown[];
      };
      const kind = input.part
        ? `part ${input.part}`
        : input.partialReports
          ? `merge ${input.partialReports.length}`
          : 'whole';
      calls.push(kind);
      if (calls.length === failOnCall) throw new AIError('AI_PROVIDER_UNAVAILABLE', 'caído');
      return {
        provider: 'fake',
        model: 'fake-v1',
        payload: report(kind),
        usage: null,
        latencyMs: 1,
      };
    },
  };
}

describe('Source report jobs', () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const w = await createWorkspace(ctx.prisma, 'Reports');
    projectId = (await ctx.projects.create({ workspaceId: w.id, name: 'Reportes' })).id;
  });
  afterAll(async () => ctx.close());

  const service = (provider: AIProvider, tokensPerMinute: number) =>
    new SourcesService(
      ctx.prisma,
      new AIOrchestrator(
        new FallbackAIProvider([{ provider, capacity: { tokensPerMinute } }]),
        new PromptRegistry(
          prompts.map((key) => ({
            key,
            version: 1,
            capability: 'STRUCTURED_OUTPUT' as const,
            purpose: 'source_interpretation',
            systemInstructions: 'policy',
          })),
        ),
        new PrismaAIRunRecorder(ctx.prisma),
      ),
      new SourceContentExtractor(),
      new FakeStorageProvider(),
      {} as never,
      { add: vi.fn().mockResolvedValue(undefined), close: vi.fn() } as never,
    );

  async function source(text: string) {
    return ctx.sources.create(
      projectId,
      { title: 'Especificación', sourceKind: 'TEXT', purpose: 'Requisitos', description: '' },
      {
        originalname: 'especificacion.md',
        mimetype: 'text/markdown',
        size: Buffer.byteLength(text),
        buffer: Buffer.from(text),
      },
    );
  }
  // Twenty sections of about 800 tokens each: three parts at Groq's size.
  const longText = Array.from(
    { length: 20 },
    (_, i) => `# Capítulo ${i + 1}\n\n${'Detalle del proceso de pedidos. '.repeat(75)}`,
  ).join('\n\n');

  it('reads a short source in one request', async () => {
    const provider = scriptedProvider();
    const sources = service(provider, 1_000_000);
    const created = await source('# Pedidos\n\nEl cliente registra pedidos.');
    const { job } = await sources.requestReport(projectId, created.id);
    await sources.runReportJob(projectId, job!.id);
    expect(provider.calls).toEqual(['whole']);
    expect((await sources.reportJob(projectId, created.id)).job).toMatchObject({
      status: 'COMPLETED',
      totalParts: 1,
      completedParts: 1,
      candidate: { content: { summary: 'whole' } },
    });
  });

  it('reads a long source part by part, merges them, and resumes after a failure', async () => {
    const created = await source(longText);
    // Groq-sized capacity: the text needs several parts.
    const failing = scriptedProvider(3);
    const first = service(failing, 8_000);
    const { job } = await first.requestReport(projectId, created.id);
    await first.runReportJob(projectId, job!.id);
    const failed = (await first.reportJob(projectId, created.id)).job!;
    expect(failed).toMatchObject({ status: 'FAILED', completedParts: 2, candidate: null });
    expect(failed.errorMessage).toBe('caído');
    const totalParts = failed.totalParts!;
    expect(totalParts).toBeGreaterThan(2);

    // Asking again resumes the same job: done parts are not read again, even
    // if a larger provider is available now (the plan stays the same).
    const healthy = scriptedProvider();
    const second = service(healthy, 1_000_000);
    const resumed = await second.requestReport(projectId, created.id);
    expect(resumed.job!.id).toBe(job!.id);
    await second.runReportJob(projectId, job!.id);
    expect(healthy.calls.filter((c) => c.startsWith('part'))).toEqual(
      Array.from({ length: totalParts - 2 }, (_, i) => `part ${i + 3}`),
    );
    expect(healthy.calls.at(-1)).toBe(`merge ${totalParts}`);
    expect((await second.reportJob(projectId, created.id)).job).toMatchObject({
      status: 'COMPLETED',
      completedParts: totalParts,
      candidate: { content: { summary: `merge ${totalParts}` } },
    });
    expect(await ctx.prisma.sourceReportJobPart.count({ where: { jobId: job!.id } })).toBe(
      totalParts,
    );
  });

  it('never runs a job twice, nor one from another project', async () => {
    const provider = scriptedProvider();
    const sources = service(provider, 1_000_000);
    const created = await source('# Pagos\n\nSe paga al recibir.');
    const { job } = await sources.requestReport(projectId, created.id);
    // Asking again while it is queued returns the same job.
    expect((await sources.requestReport(projectId, created.id)).job!.id).toBe(job!.id);
    const w = await createWorkspace(ctx.prisma, 'Ajeno');
    const other = (await ctx.projects.create({ workspaceId: w.id, name: 'Ajeno' })).id;
    await expect(sources.runReportJob(other, job!.id)).rejects.toThrow('no encontrado');
    await Promise.all([
      sources.runReportJob(projectId, job!.id),
      sources.runReportJob(projectId, job!.id),
    ]);
    expect(provider.calls).toEqual(['whole']);
  });
});
