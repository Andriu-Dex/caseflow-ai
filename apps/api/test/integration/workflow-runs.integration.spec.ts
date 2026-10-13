import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  AIError,
  type AIProvider,
  type AIProviderRequest,
  type AIProviderResponse,
} from '@caseflow-ai/ai';
import { WorkflowRunsService } from '../../src/construction/workflow-runs.service';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';
import { CONTENT } from './support/construction-fixtures';
import type { FakeStorageProvider } from '@caseflow-ai/integrations';
import { STORAGE_PROVIDER } from '../../src/sources/storage-provider.token';

// One canned answer per prompt; the use cases cite the requirement versions
// they were given, like a real model must.
const ANSWERS: Record<string, (request: AIProviderRequest) => unknown> = {
  project_context_generation: () => ({
    problemStatement: 'Los pedidos se anotan en papel.',
    objective: 'Registrar pedidos en línea.',
    actors: [{ name: 'Vendedor' }],
    scopeItems: [{ type: 'IN_SCOPE', description: 'Pedidos' }],
    needs: ['Registrar pedidos'],
    constraints: [],
    businessRules: [],
  }),
  requirements_generation: () => ({
    candidates: [
      {
        candidateId: 'rc-1',
        requirementType: 'FUNCTIONAL',
        name: 'Registrar pedido',
        description: 'El vendedor registra un pedido.',
        priority: 'HIGH',
        actors: ['Vendedor'],
        preconditions: [],
        postconditions: [],
        contextItemCodes: ['N-1'],
        dependencyCandidateIds: [],
      },
    ],
  }),
  use_case_generation: (req) => ({
    candidates: [
      {
        candidateId: 'uc-1',
        name: 'Registrar pedido',
        objective: 'Registrar un pedido',
        primaryActor: 'Vendedor',
        secondaryActors: [],
        preconditions: [],
        postconditions: [],
        mainFlow: [{ actor: 'Vendedor', action: 'Registra el pedido' }],
        alternativeFlows: [],
        relatedRequirementSourceIds: [
          /"requirementVersionId":"([0-9a-f-]{36})"/.exec(req.messages[0]!.content)![1],
        ],
      },
    ],
  }),
  conceptual_data_model_generation: () => ({
    candidates: [
      {
        candidateId: 'dm-1',
        title: 'Modelo',
        modelKind: 'ER',
        entities: [
          {
            localId: 'pedido',
            name: 'Pedido',
            attributes: [
              { name: 'id', type: 'UUID', required: true, primaryKey: true, unique: true },
            ],
          },
        ],
        relationships: [],
      },
    ],
  }),
  // One class per data-model entity, with all its attributes (DEC-121).
  class_diagram_generation: () => ({
    classes: [
      {
        localId: 'pedido',
        name: 'Pedido',
        dataModelEntityName: 'Pedido',
        attributes: [{ name: 'id', type: 'UUID' }],
      },
    ],
  }),
  navigation_generation: () => CONTENT.NAVIGATION_TREE,
  software_architecture_generation: () => CONTENT.SOFTWARE_ARCHITECTURE,
  system_architecture_generation: () => CONTENT.SYSTEM_ARCHITECTURE,
  // Coherent with the navigation, the use case and the plan below (DEC-121).
  ui_blueprint_generation: () => ({
    screens: [
      {
        ...(CONTENT.UI_BLUEPRINT!.screens as object[])[0],
        relatedUseCaseCodes: ['CU-001'],
        relatedSourceCodes: ['CU-001'],
      },
    ],
  }),
  // The first palette fails WCAG AA: the orchestrator must take the second.
  design_theme_generation: () => ({
    palettes: [
      {
        ...CONTENT.DESIGN_THEME,
        name: 'Ilegible',
        light: {
          ...(CONTENT.DESIGN_THEME!.light as Record<string, string>),
          foreground: '#eeeeee',
        },
      },
      CONTENT.DESIGN_THEME,
    ],
  }),
  generation_plan_generation: () => CONTENT.GENERATION_PLAN,
  conceptual_domain_model_generation: () => ({
    entities: [
      {
        localId: 'pedido',
        name: 'Pedido',
        classLocalId: 'pedido',
        description: 'Solicitud de compra.',
        attributes: [{ name: 'id' }],
      },
    ],
  }),
  implementation_plan_generation: () => ({
    authentication: { required: false, roles: [] },
    modules: [{ localId: 'sales', name: 'Sales', description: 'Pedidos' }],
    entities: [
      {
        localId: 'order',
        name: 'Order',
        moduleLocalId: 'sales',
        classLocalId: 'pedido',
        fields: [{ name: 'total', type: 'DECIMAL' }],
        operations: ['LIST', 'GET', 'CREATE'],
      },
    ],
    routes: [
      {
        path: '/orders',
        screenName: 'Pedidos',
        screenLocalId: 'home',
        moduleLocalId: 'sales',
        kind: 'LIST',
        entityLocalId: 'order',
        actions: [{ label: 'Confirmar pedido', operation: 'CREATE' }],
      },
    ],
  }),
};

class ScriptedAIProvider implements AIProvider {
  readonly id = 'scripted';
  failing = new Set<string>();
  calls: string[] = [];
  async generateStructured(req: AIProviderRequest): Promise<AIProviderResponse> {
    this.calls.push(req.purpose);
    if (this.failing.has(req.purpose))
      throw new AIError('AI_PROVIDER_UNAVAILABLE', 'El proveedor de IA no respondió.');
    const answer = ANSWERS[req.purpose];
    if (!answer) throw new Error(`No scripted answer for ${req.purpose}`);
    return { provider: 'scripted', model: 'v1', payload: answer(req), usage: null, latencyMs: 1 };
  }
}

// Route orchestration (DEC-116): BUILD_ONLY from one prompt to a queued validation.
describe('Workflow runs integration', () => {
  const ai = new ScriptedAIProvider();
  let ctx: TestContext;
  let workspaceId: string;
  let runs: WorkflowRunsService;
  const http = () => request(ctx.app.getHttpServer());
  const auth = { Authorization: '' };

  beforeAll(async () => {
    ctx = await createTestContext({ aiProvider: ai });
    auth.Authorization = `Bearer ${ctx.token}`;
    workspaceId = (await createWorkspaceWithOwner(ctx, 'Orquestación')).id;
    runs = ctx.app.get(WorkflowRunsService);
  });
  afterAll(async () => ctx.close());

  const project = async (workflowRoute: string) =>
    (
      await http()
        .post('/projects')
        .set(auth)
        .send({ workspaceId, name: `Proyecto ${workflowRoute}`, workflowRoute })
        .expect(201)
    ).body.id as string;
  const start = (projectId: string) =>
    http()
      .post(`/projects/${projectId}/workflow-runs`)
      .set(auth)
      .send({ prompt: 'Una app para registrar los pedidos de una tienda.' });

  it('builds the whole chain stage by stage, approving automatically', async () => {
    const projectId = await project('BUILD_ONLY');
    const started = await start(projectId).expect(202);
    expect(started.body).toMatchObject({ status: 'QUEUED', completedStages: [] });

    await runs.runJob(projectId, started.body.id);
    const run = await runs.get(projectId, started.body.id);
    expect(run).toMatchObject({ status: 'COMPLETED', errorMessage: null, currentStage: null });
    expect(run.completedStages).toHaveLength(19);

    // The prompt is the project's first source, so everything traces back to it.
    const source = await ctx.prisma.sourceDetail.findFirstOrThrow({
      where: { artifactVersion: { projectId } },
    });
    expect(source.extractedText).toBe('Una app para registrar los pedidos de una tienda.');

    const approved = await ctx.prisma.artifactVersion.findMany({
      where: { projectId, status: 'APPROVED' },
    });
    // Source, context, requirement, use case, data model, class diagram, five design kinds,
    // mockup, generation plan, conceptual model and implementation plan.
    expect(approved).toHaveLength(15);
    expect(new Set(approved.map((v) => v.approvalOrigin))).toEqual(new Set(['AUTOMATIC']));
    const baseline = await ctx.prisma.designBaseline.findFirstOrThrow({ where: { projectId } });
    expect(baseline.approvalOrigin).toBe('AUTOMATIC');

    const theme = await ctx.prisma.structuredAnalysisDetail.findFirstOrThrow({
      where: { kind: 'DESIGN_THEME', artifactVersion: { projectId } },
    });
    expect((theme.content as { name: string }).name).toBe(
      (CONTENT.DESIGN_THEME as { name: string }).name,
    );

    const generation = await ctx.prisma.generationRun.findFirstOrThrow({ where: { projectId } });
    expect(generation.status).toBe('GENERATED');
    expect(await ctx.prisma.sandboxRun.count({ where: { generationRunId: generation.id } })).toBe(
      1,
    );

    // A second delivery of the same job does nothing.
    await runs.runJob(projectId, started.body.id);
    expect(await ctx.prisma.generationRun.count({ where: { projectId } })).toBe(1);
  });

  // DEC-134: deleting a fully built project leaves nothing of it behind.
  it('deletes a fully built project: every row and every stored file', async () => {
    const projectId = await project('BUILD_ONLY');
    const started = await start(projectId).expect(202);
    await runs.runJob(projectId, started.body.id);
    expect((await runs.get(projectId, started.body.id)).status).toBe('COMPLETED');

    // Every table that names a project, found from the schema itself, so a
    // table added later is checked too.
    const tables = (
      await ctx.prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'project_id'
          AND table_name <> 'project_deletions'`
    ).map((row) => row.table_name);
    const remaining = async () => {
      const counts: Record<string, number> = {};
      for (const table of tables) {
        const [row] = await ctx.prisma.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT count(*) AS count FROM "${table}" WHERE project_id = $1::uuid`,
          projectId,
        );
        if (row!.count > 0n) counts[table] = Number(row!.count);
      }
      return counts;
    };
    const before = await remaining();
    // The chain really built history: approved versions, a frozen baseline,
    // a generation and its validation, and the audit trail.
    expect(Object.keys(before)).toEqual(
      expect.arrayContaining([
        'artifact_versions',
        'design_baselines',
        'generation_runs',
        'sandbox_runs',
        'audit_events',
      ]),
    );
    const storage = ctx.app.get<FakeStorageProvider>(STORAGE_PROVIDER, { strict: false });
    const archives = await ctx.prisma.generatedProjectSnapshot.findMany({
      where: { projectId },
      select: { archiveStorageKey: true },
    });
    for (const { archiveStorageKey } of archives)
      await storage.putObject({
        key: archiveStorageKey,
        body: Buffer.from('zip'),
        contentType: 'application/zip',
      });

    // Through the API, with the exact name the page asks for.
    await http()
      .delete(`/projects/${projectId}`)
      .set(auth)
      .send({ confirmName: 'Proyecto equivocado' })
      .expect(422);
    await http()
      .delete(`/projects/${projectId}`)
      .set(auth)
      .send({ confirmName: 'Proyecto BUILD_ONLY' })
      .expect(204);

    expect(await remaining()).toEqual({});
    for (const { archiveStorageKey } of archives)
      expect(storage.has(archiveStorageKey)).toBe(false);
    expect(await ctx.prisma.projectDeletion.count({ where: { projectId } })).toBe(1);
  });

  it('stops at the first failure and resumes there without duplicating work', async () => {
    const projectId = await project('BUILD_ONLY');
    ai.failing.add('use_case_generation');
    const started = await start(projectId).expect(202);
    await runs.runJob(projectId, started.body.id);
    const failed = await runs.get(projectId, started.body.id);
    expect(failed).toMatchObject({ status: 'FAILED', currentStage: 'USE_CASES' });
    expect(failed.errorMessage).toContain('La etapa «casos de uso» no se completó');
    expect(failed.completedStages).toEqual(['SOURCE', 'CONTEXT', 'REQUIREMENTS']);

    ai.failing.clear();
    ai.calls = [];
    await http()
      .post(`/projects/${projectId}/workflow-runs/${started.body.id}/retry`)
      .set(auth)
      .expect(202);
    await runs.runJob(projectId, started.body.id);
    expect((await runs.get(projectId, started.body.id)).status).toBe('COMPLETED');
    // Earlier stages were not generated again.
    expect(ai.calls).not.toContain('project_context_generation');
    expect(ai.calls).not.toContain('requirements_generation');
    expect(
      await ctx.prisma.artifact.count({ where: { projectId, artifactTypeCode: 'REQUIREMENT' } }),
    ).toBe(1);

    await http()
      .post(`/projects/${projectId}/workflow-runs/${started.body.id}/retry`)
      .set(auth)
      .expect(409);
  });

  // DEC-119: EXPRESS plans from provisional drafts, then a person approves in bulk.
  it('pauses EXPRESS for two bulk reviews and records them as HUMAN_BULK', async () => {
    const projectId = await project('EXPRESS');
    const started = await start(projectId).expect(202);
    await runs.runJob(projectId, started.body.id);
    let run = await runs.get(projectId, started.body.id);
    expect(run).toMatchObject({ status: 'AWAITING_REVIEW', currentStage: 'PLANNING_REVIEW' });
    expect(run.stages).toContain('PLANNING_REVIEW');
    expect(run.completedStages.at(-1)).toBe('CONCEPTUAL_DOMAIN_MODEL');
    // The whole planning exists, and nothing is approved before the review.
    expect(
      await ctx.prisma.artifactVersion.count({ where: { projectId, status: 'APPROVED' } }),
    ).toBe(0);

    const review = await http()
      .get(`/projects/${projectId}/workflow-runs/${started.body.id}/review`)
      .set(auth)
      .expect(200);
    expect(new Set(review.body.items.map((i: { stage: string }) => i.stage)).size).toBe(14);

    await http()
      .post(`/projects/${projectId}/workflow-runs/${started.body.id}/approve`)
      .set(auth)
      .expect(202);
    const baseline = await ctx.prisma.designBaseline.findFirstOrThrow({ where: { projectId } });
    expect(baseline.approvalOrigin).toBe('HUMAN_BULK');
    await runs.runJob(projectId, started.body.id);
    run = await runs.get(projectId, started.body.id);
    expect(run).toMatchObject({ status: 'AWAITING_REVIEW', currentStage: 'IMPLEMENTATION_REVIEW' });
    expect(await ctx.prisma.generationRun.count({ where: { projectId } })).toBe(0);

    await http()
      .post(`/projects/${projectId}/workflow-runs/${started.body.id}/approve`)
      .set(auth)
      .expect(202);
    await runs.runJob(projectId, started.body.id);
    expect((await runs.get(projectId, started.body.id)).status).toBe('COMPLETED');
    const origins = await ctx.prisma.artifactVersion.findMany({
      where: { projectId, status: 'APPROVED' },
      select: { approvalOrigin: true },
    });
    expect(origins).toHaveLength(15);
    expect(new Set(origins.map((o) => o.approvalOrigin))).toEqual(new Set(['HUMAN_BULK']));
    expect(await ctx.prisma.generationRun.count({ where: { projectId } })).toBe(1);

    await http()
      .post(`/projects/${projectId}/workflow-runs/${started.body.id}/approve`)
      .set(auth)
      .expect(409);
  });

  it('needs a route with a prompt, once per project and per project', async () => {
    const full = await project('FULL');
    const refused = await start(full).expect(422);
    expect(refused.body.message).toContain('Solo construcción');

    const projectId = await project('BUILD_ONLY');
    const started = await start(projectId).expect(202);
    await start(projectId).expect(409);

    // Knowing the run id is not enough from another project.
    const other = await project('BUILD_ONLY');
    await http().get(`/projects/${other}/workflow-runs/${started.body.id}`).set(auth).expect(404);
    await http()
      .post(`/projects/${other}/workflow-runs/${started.body.id}/retry`)
      .set(auth)
      .expect(404);
    await expect(runs.runJob(other, started.body.id)).resolves.toBeUndefined();
    expect((await runs.get(projectId, started.body.id)).status).toBe('QUEUED');
  });
});
