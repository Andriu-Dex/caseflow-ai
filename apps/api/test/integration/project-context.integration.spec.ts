import type { INestApplication } from '@nestjs/common';
import {
  apiErrorResponseSchema,
  projectContextResponseSchema,
  type ProjectContextRequest,
} from '@caseflow-ai/contracts';
import {
  AIOrchestrator,
  FakeAIProvider,
  FallbackAIProvider,
  PromptRegistry,
} from '@caseflow-ai/ai';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { ProjectContextService } from '../../src/project-context/project-context.service';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

const contextInput = (suffix = ''): ProjectContextRequest => ({
  problemStatement: `Información dispersa${suffix}`,
  objective: `Centralizar el trabajo${suffix}`,
  scopeItems: [
    { type: 'OUT_OF_SCOPE', description: `Facturación${suffix}` },
    { type: 'IN_SCOPE', description: `Análisis${suffix}` },
  ],
  actors: [
    { name: `Analista${suffix}`, description: `Gestiona información${suffix}` },
    { name: `Revisor${suffix}` },
  ],
  needs: [{ description: `Trazabilidad${suffix}` }, { description: `Versiones${suffix}` }],
  constraints: [{ description: `Sin dependencia de IA${suffix}` }],
  businessRules: [{ description: `Un contexto por proyecto${suffix}` }],
  additionalContext: `Contexto adicional${suffix}`,
});

async function createProject(ctx: TestContext, name: string) {
  const workspace = await createWorkspaceWithOwner(ctx, `${name} Workspace`);
  return ctx.projects.create({ workspaceId: workspace.id, name });
}

describe('Project Context integration', () => {
  let ctx: TestContext;
  let service: ProjectContextService;
  let app: INestApplication;

  beforeAll(async () => {
    ctx = await createTestContext();
    service = ctx.projectContext;
    app = ctx.app;
  });

  afterAll(async () => ctx.close());

  it('creates the canonical PROJECT_CONTEXT with CTX-001 and an ordered version 1 snapshot', async () => {
    const project = await createProject(ctx, 'Creation');
    const result = await service.create(project.id, contextInput());

    expect(projectContextResponseSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      projectId: project.id,
      type: 'PROJECT_CONTEXT',
      code: 'CTX-001',
      version: { versionNumber: 1, origin: 'MANUAL', status: 'DRAFT' },
      problemStatement: 'Información dispersa',
      objective: 'Centralizar el trabajo',
    });
    expect(result.actors.map(({ position, name }) => ({ position, name }))).toEqual([
      { position: 0, name: 'Analista' },
      { position: 1, name: 'Revisor' },
    ]);
    expect(result.scopeItems.map(({ position, type }) => ({ position, type }))).toEqual([
      { position: 0, type: 'OUT_OF_SCOPE' },
      { position: 1, type: 'IN_SCOPE' },
    ]);
    expect(result.needs.map((item) => item.position)).toEqual([0, 1]);
    expect(result.constraints.map((item) => item.position)).toEqual([0]);
    expect(result.businessRules.map((item) => item.position)).toEqual([0]);
  });

  it('rejects a second canonical context and blocks the generic Artifact service bypass', async () => {
    const project = await createProject(ctx, 'Unique');
    await service.create(project.id, contextInput());
    await expect(service.create(project.id, contextInput(' second'))).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      ctx.artifacts.createArtifact(project.id, { type: 'PROJECT_CONTEXT', title: 'Bypass' }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('creates immutable complete snapshots and resolves the latest deterministically', async () => {
    const project = await createProject(ctx, 'Versioned');
    const first = await service.create(project.id, contextInput(' v1'));
    const before = await ctx.prisma.projectContextDetail.findUniqueOrThrow({
      where: { artifactVersionId: first.version.id },
      include: {
        actors: true,
        needs: true,
        constraints: true,
        businessRules: true,
        scopeItems: true,
      },
    });

    const second = await service.createVersion(project.id, contextInput(' v2'));
    const after = await ctx.prisma.projectContextDetail.findUniqueOrThrow({
      where: { artifactVersionId: first.version.id },
      include: {
        actors: true,
        needs: true,
        constraints: true,
        businessRules: true,
        scopeItems: true,
      },
    });
    expect(second.version.versionNumber).toBe(2);
    expect(after).toEqual(before);
    expect((await service.getCurrent(project.id)).version.versionNumber).toBe(2);

    await expect(
      ctx.prisma.projectContextDetail.update({
        where: { artifactVersionId: first.version.id },
        data: { objective: 'Mutación prohibida' },
      }),
    ).rejects.toThrow();

    // Content is still never editable in place, on any version regardless
    // of status. Deletion, however, is deliberately allowed for a version
    // that was never approved (here `first`/v1 stayed DRAFT — superseded
    // by v2, but never approved) — this is what lets a user hard-delete a
    // never-approved artifact. An APPROVED version remains undeletable.
    await ctx.prisma.projectContextActor.delete({ where: { id: before.actors[0]!.id } });

    await service.transition(project.id, second.version.id, 'IN_REVIEW');
    const approved = await service.transition(project.id, second.version.id, 'APPROVED');
    const approvedDetail = await ctx.prisma.projectContextDetail.findUniqueOrThrow({
      where: { artifactVersionId: approved.id },
      include: { actors: true },
    });
    await expect(
      ctx.prisma.projectContextActor.delete({ where: { id: approvedDetail.actors[0]!.id } }),
    ).rejects.toThrow();
  });

  it('serializes concurrent version creation without duplicates or gaps', async () => {
    const project = await createProject(ctx, 'Concurrent');
    await service.create(project.id, contextInput(' initial'));
    const versions = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        service.createVersion(project.id, contextInput(` ${index}`)),
      ),
    );
    expect(versions.map((item) => item.version.versionNumber).sort((a, b) => a - b)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('enforces project isolation for reads and versions', async () => {
    const projectA = await createProject(ctx, 'Isolation A');
    const projectB = await createProject(ctx, 'Isolation B');
    await service.create(projectA.id, contextInput());
    await expect(service.getCurrent(projectB.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.createVersion(projectB.id, contextInput())).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await request(app.getHttpServer()).get(`/projects/${projectB.id}/context`)).status,
    ).toBe(404);
  });

  it('enforces the explicit human approval gate lifecycle', async () => {
    const project = await createProject(ctx, 'Approval Gate');
    const draft = await service.create(project.id, contextInput());
    expect(draft.version.status).toBe('DRAFT');
    await expect(service.transition(project.id, draft.version.id, 'APPROVED')).rejects.toThrow(
      'Transición',
    );
    await service.transition(project.id, draft.version.id, 'IN_REVIEW');
    const approved = await service.transition(project.id, draft.version.id, 'APPROVED');
    expect(approved.status).toBe('APPROVED');
  });

  it('enforces the canonical uniqueness invariant in PostgreSQL', async () => {
    const project = await createProject(ctx, 'Database Unique');
    await service.create(project.id, contextInput());
    await expect(
      ctx.sql.query(
        `INSERT INTO artifacts (project_id, artifact_type_code, code)
         VALUES ($1, 'PROJECT_CONTEXT', 'CTX-999')`,
        [project.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('links exact APPROVED PROJECT_SOURCE versions and answers which sources support this context', async () => {
    const project = await createProject(ctx, 'Sources');
    const source = await ctx.sources.create(
      project.id,
      {
        title: 'Entrevista',
        sourceKind: 'TEXT',
        purpose: 'Notas de la entrevista con finanzas',
        description: 'Contenido de prueba.',
      },
      {
        originalname: 'notas.txt',
        mimetype: 'text/plain',
        size: 12,
        buffer: Buffer.from('Notas reales'),
      },
    );
    await ctx.sources.transition(project.id, source.id, source.version.id, 'IN_REVIEW');
    const approvedSource = await ctx.sources.transition(
      project.id,
      source.id,
      source.version.id,
      'APPROVED',
    );

    const result = await service.create(project.id, {
      ...contextInput(' con fuentes'),
      sourceVersionIds: [approvedSource.id],
    });
    expect(projectContextResponseSchema.parse(result)).toEqual(result);
    expect(result.sources).toEqual([
      { id: source.id, versionId: approvedSource.id, code: source.code, title: 'Entrevista' },
    ]);
  });

  it('rejects a context that cites two versions of the same source at once', async () => {
    const project = await createProject(ctx, 'Sources Duplicate Artifact');
    const source = await ctx.sources.create(
      project.id,
      {
        title: 'Entrevista',
        sourceKind: 'TEXT',
        purpose: 'p',
        description: 'Contenido de prueba.',
      },
      { originalname: 'n.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('abcd') },
    );
    await ctx.sources.transition(project.id, source.id, source.version.id, 'IN_REVIEW');
    const v1 = await ctx.sources.transition(project.id, source.id, source.version.id, 'APPROVED');
    const draftV2 = await ctx.sources.submitManualTranscript(
      project.id,
      source.id,
      'Contenido actualizado',
    );
    await ctx.sources.transition(project.id, source.id, draftV2.version.id, 'IN_REVIEW');
    const v2 = await ctx.sources.transition(project.id, source.id, draftV2.version.id, 'APPROVED');

    // Citing two versions of the same source at once is never meaningful
    // provenance (v2 supersedes v1) — and it used to make a brand-new
    // context immediately contradict itself in staleness ("up to date" and
    // "has a newer version" at once).
    await expect(
      service.create(project.id, {
        ...contextInput(' duplicada'),
        sourceVersionIds: [v1.id, v2.id],
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('rejects a draft (unapproved) or cross-project source as Project Context provenance', async () => {
    const project = await createProject(ctx, 'Sources Reject');
    const draft = await ctx.sources.create(
      project.id,
      { title: 'Borrador', sourceKind: 'TEXT', purpose: 'p', description: 'Contenido de prueba.' },
      { originalname: 'n.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('abcd') },
    );
    await expect(
      service.create(project.id, {
        ...contextInput(' borrador'),
        sourceVersionIds: [draft.version.id],
      }),
    ).rejects.toMatchObject({ status: 422 });

    const otherProject = await createProject(ctx, 'Sources Other');
    const otherSource = await ctx.sources.create(
      otherProject.id,
      { title: 'Otro', sourceKind: 'TEXT', purpose: 'p', description: 'Contenido de prueba.' },
      { originalname: 'n.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('abcd') },
    );
    await ctx.sources.transition(
      otherProject.id,
      otherSource.id,
      otherSource.version.id,
      'IN_REVIEW',
    );
    const otherApproved = await ctx.sources.transition(
      otherProject.id,
      otherSource.id,
      otherSource.version.id,
      'APPROVED',
    );
    await expect(
      service.create(project.id, {
        ...contextInput(' cruzado'),
        sourceVersionIds: [otherApproved.id],
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('validates HTTP requests and returns contract-safe success and error bodies', async () => {
    const project = await createProject(ctx, 'HTTP');
    const created = await request(app.getHttpServer())
      .post(`/projects/${project.id}/context`)
      .send(contextInput());
    expect(created.status).toBe(201);
    expect(projectContextResponseSchema.safeParse(created.body).success).toBe(true);

    const unknown = await request(app.getHttpServer())
      .post(`/projects/${project.id}/context/versions`)
      .send({ ...contextInput(), actors: [{ name: ' ' }] });
    expect(unknown.status).toBe(400);
    expect(apiErrorResponseSchema.safeParse(unknown.body).success).toBe(true);

    const extra = await request(app.getHttpServer())
      .post(`/projects/${project.id}/context/versions`)
      .send({ ...contextInput(), unexpected: true });
    expect(extra.status).toBe(400);
    expect(JSON.stringify(extra.body)).not.toMatch(/prisma|project_context_details|stack/i);
  });

  describe('AI-assisted generation', () => {
    async function createApprovedSource(ctxParam: TestContext, projectId: string, title: string) {
      const source = await ctxParam.sources.create(
        projectId,
        { title, sourceKind: 'TEXT', purpose: 'Prueba', description: 'Contenido de prueba.' },
        {
          originalname: 'n.txt',
          mimetype: 'text/plain',
          size: 4,
          buffer: Buffer.from('abcd'),
        },
      );
      await ctxParam.sources.transition(projectId, source.id, source.version.id, 'IN_REVIEW');
      return ctxParam.sources.transition(projectId, source.id, source.version.id, 'APPROVED');
    }

    it('generates a candidate from approved sources and persists it for evidence', async () => {
      const project = await createProject(ctx, 'AI Generation');
      const approvedSource = await createApprovedSource(ctx, project.id, 'Entrevista IA');

      const content = {
        problemStatement: 'Problema generado',
        objective: 'Objetivo generado',
        // DEC-131: actor roles and scope come in the proposal too.
        actors: [{ name: 'Coordinador', description: 'Aprueba los pedidos' }],
        scopeItems: [{ type: 'OUT_OF_SCOPE', description: 'Facturación electrónica' }],
        needs: ['Visibilidad en tiempo real'],
        constraints: [],
        businessRules: ['Bloquear morosos'],
      };
      const ai = new AIOrchestrator(
        new FakeAIProvider({
          provider: 'fake',
          model: 'fake-v1',
          payload: content,
          usage: null,
          latencyMs: 1,
        }),
        new PromptRegistry([
          {
            key: 'project-context.generate',
            version: 4,
            capability: 'STRUCTURED_OUTPUT',
            purpose: 'project_context_generation',
            systemInstructions: 'policy',
          },
        ]),
        new PrismaAIRunRecorder(ctx.prisma),
      );
      const service = new ProjectContextService(ctx.prisma, ai);

      const candidate = await service.generate(project.id);

      expect(candidate).toMatchObject({
        projectId: project.id,
        content,
        sourceVersionIds: [approvedSource.id],
      });
      expect(
        await ctx.prisma.projectContextCandidate.findUnique({ where: { id: candidate.id } }),
      ).toMatchObject({ projectId: project.id });
    });

    it('uses only the latest APPROVED version of a source, never an older approved one too', async () => {
      const project = await createProject(ctx, 'AI Latest Version');
      const v1 = await createApprovedSource(ctx, project.id, 'Entrevista');
      const draftV2 = await ctx.sources.submitManualTranscript(
        project.id,
        v1.artifactId,
        'Contenido actualizado',
      );
      await ctx.sources.transition(project.id, v1.artifactId, draftV2.version.id, 'IN_REVIEW');
      const v2 = await ctx.sources.transition(
        project.id,
        v1.artifactId,
        draftV2.version.id,
        'APPROVED',
      );

      const content = {
        problemStatement: 'Problema generado',
        objective: 'Objetivo generado',
        actors: [],
        needs: [],
        constraints: [],
        businessRules: [],
      };
      const ai = new AIOrchestrator(
        new FakeAIProvider({
          provider: 'fake',
          model: 'fake-v1',
          payload: content,
          usage: null,
          latencyMs: 1,
        }),
        new PromptRegistry([
          {
            key: 'project-context.generate',
            version: 4,
            capability: 'STRUCTURED_OUTPUT',
            purpose: 'project_context_generation',
            systemInstructions: 'policy',
          },
        ]),
        new PrismaAIRunRecorder(ctx.prisma),
      );
      const service = new ProjectContextService(ctx.prisma, ai);

      const candidate = await service.generate(project.id);

      // Only v2 — v1 is still APPROVED (immutable history), but it is no
      // longer current knowledge, so it must never be cited alongside v2.
      expect(candidate.sourceVersionIds).toEqual([v2.id]);
    });

    // DEC-124: an approved report guides the proposal, only for the exact
    // version cited, and the candidate records which reports were used.
    it('passes the report of each exact cited version as guidance and records it', async () => {
      const project = await createProject(ctx, 'AI With Reports');
      const report = {
        summary: 'Reunión con administración',
        actors: ['Coordinador'],
        businessConcepts: [],
        candidateBusinessRules: [],
        candidateConstraints: [],
        needs: ['Ver reservas'],
        importantFacts: [],
        ambiguities: [],
      };
      // With a report on the version that is approved.
      const draft = await ctx.sources.create(
        project.id,
        { title: 'Con reporte', sourceKind: 'TEXT', purpose: 'Prueba', description: '' },
        { originalname: 'a.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('abcd') },
      );
      await ctx.sources.submitManualReport(project.id, draft.id, report);
      await ctx.sources.transition(project.id, draft.id, draft.version.id, 'IN_REVIEW');
      const reported = await ctx.sources.transition(
        project.id,
        draft.id,
        draft.version.id,
        'APPROVED',
      );
      // A report on an older version: its corrected, approved v2 has none.
      const old = await ctx.sources.create(
        project.id,
        { title: 'Corregida', sourceKind: 'TEXT', purpose: 'Prueba', description: '' },
        { originalname: 'b.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('efgh') },
      );
      await ctx.sources.submitManualReport(project.id, old.id, report);
      await ctx.sources.transition(project.id, old.id, old.version.id, 'IN_REVIEW');
      await ctx.sources.transition(project.id, old.id, old.version.id, 'APPROVED');
      const corrected = await ctx.sources.submitManualTranscript(
        project.id,
        old.id,
        'Texto corregido',
      );
      await ctx.sources.transition(project.id, old.id, corrected.version.id, 'IN_REVIEW');
      const v2 = await ctx.sources.transition(project.id, old.id, corrected.version.id, 'APPROVED');

      const content = {
        problemStatement: 'Problema',
        objective: 'Objetivo',
        actors: [{ name: 'Coordinador' }],
        needs: [],
        constraints: [],
        businessRules: [],
      };
      const fake = new FakeAIProvider({
        provider: 'fake',
        model: 'fake-v1',
        payload: content,
        usage: null,
        latencyMs: 1,
      });
      const requests: { messages: { content: string }[] }[] = [];
      const provider = {
        id: fake.id,
        generateStructured: (request: Parameters<typeof fake.generateStructured>[0]) => {
          requests.push(request as never);
          return fake.generateStructured(request);
        },
      };
      const ai = new AIOrchestrator(
        provider as never,
        new PromptRegistry([
          {
            key: 'project-context.generate',
            version: 4,
            capability: 'STRUCTURED_OUTPUT',
            purpose: 'project_context_generation',
            systemInstructions: 'policy',
          },
        ]),
        new PrismaAIRunRecorder(ctx.prisma),
      );

      const candidate = await new ProjectContextService(ctx.prisma, ai).generate(project.id);

      const sent = JSON.parse(requests[0]!.messages.at(-1)!.content) as {
        title: string;
        report?: unknown;
      }[];
      expect(sent.find((s) => s.title === 'Con reporte')?.report).toEqual(report);
      expect(sent.find((s) => s.title === 'Corregida')).not.toHaveProperty('report');
      expect(candidate.sourceVersionIds.sort()).toEqual([reported.id, v2.id].sort());
      expect(candidate.reportSourceVersionIds).toEqual([reported.id]);
      expect(
        await ctx.prisma.projectContextCandidate.findUniqueOrThrow({ where: { id: candidate.id } }),
      ).toMatchObject({ reportSourceVersionIds: [reported.id] });
    });

    // DEC-127: the proposal reads a bounded input that fits the provider;
    // a long source is sent as excerpts and recorded as such.
    it('fits the smallest provider by sending long sources as excerpts', async () => {
      const project = await createProject(ctx, 'AI Long Sources');
      const approve = async (title: string, text: string) => {
        const created = await ctx.sources.create(
          project.id,
          { title, sourceKind: 'TEXT', purpose: 'Prueba', description: '' },
          {
            originalname: 'fuente.md',
            mimetype: 'text/markdown',
            size: Buffer.byteLength(text),
            buffer: Buffer.from(text),
          },
        );
        await ctx.sources.transition(project.id, created.id, created.version.id, 'IN_REVIEW');
        return ctx.sources.transition(project.id, created.id, created.version.id, 'APPROVED');
      };
      const short = await approve('Corta', 'El cliente registra pedidos.');
      const long = await approve(
        'Larga',
        Array.from(
          { length: 40 },
          (_, i) => `# Capítulo ${i + 1}\n\n${'Detalle del proceso de pedidos. '.repeat(40)}`,
        ).join('\n\n'),
      );
      const content = {
        problemStatement: 'Problema',
        objective: 'Objetivo',
        actors: [],
        needs: [],
        constraints: [],
        businessRules: [],
      };
      const fake = new FakeAIProvider({
        provider: 'fake',
        model: 'fake-v1',
        payload: content,
        usage: null,
        latencyMs: 1,
      });
      const ai = new AIOrchestrator(
        // Groq-sized: the long source alone would not fit.
        new FallbackAIProvider([{ provider: fake, capacity: { tokensPerMinute: 8_000 } }]),
        new PromptRegistry([
          {
            key: 'project-context.generate',
            version: 4,
            capability: 'STRUCTURED_OUTPUT',
            purpose: 'project_context_generation',
            systemInstructions: 'policy',
          },
        ]),
        new PrismaAIRunRecorder(ctx.prisma),
      );

      const candidate = await new ProjectContextService(ctx.prisma, ai).generate(project.id);

      const sent = JSON.parse(fake.lastRequest!.messages[0]!.content) as {
        title: string;
        extractedText?: string;
        partial?: boolean;
        excerpts?: unknown[];
      }[];
      expect(sent.find((s) => s.title === 'Corta')).toMatchObject({
        extractedText: 'El cliente registra pedidos.',
      });
      const excerpted = sent.find((s) => s.title === 'Larga')!;
      expect(excerpted.partial).toBe(true);
      expect(excerpted.excerpts!.length).toBeGreaterThan(0);
      expect(candidate.sourceVersionIds.sort()).toEqual([short.id, long.id].sort());
      expect(candidate.partialSourceVersionIds).toEqual([long.id]);
      expect(
        await ctx.prisma.projectContextCandidate.findUniqueOrThrow({ where: { id: candidate.id } }),
      ).toMatchObject({ partialSourceVersionIds: [long.id] });
    });

    it('rejects generation for a project without any usable approved source', async () => {
      const project = await createProject(ctx, 'AI No Sources');
      await expect(ctx.projectContext.generate(project.id)).rejects.toMatchObject({ status: 422 });
    });

    it('disabled AI returns AI_NOT_CONFIGURED without persisting a candidate', async () => {
      const project = await createProject(ctx, 'AI Disabled');
      await createApprovedSource(ctx, project.id, 'Entrevista Disabled');
      const before = await ctx.prisma.projectContextCandidate.count();

      await expect(ctx.projectContext.generate(project.id)).rejects.toMatchObject({
        response: { code: 'AI_NOT_CONFIGURED' },
      });
      expect(await ctx.prisma.projectContextCandidate.count()).toBe(before);
    });
  });
});
