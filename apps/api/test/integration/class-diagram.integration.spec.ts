import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { AIProvider, AIProviderResponse } from '@caseflow-ai/ai';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';
import { CONTENT, freezableDesign } from './support/construction-fixtures';

// The AI forgets the "cliente" attribute of the data model's entity.
const incompleteAnswer: AIProvider = {
  id: 'scripted',
  async generateStructured(): Promise<AIProviderResponse> {
    return {
      provider: 'scripted',
      model: 'v1',
      payload: {
        classes: [
          {
            localId: 'pedido',
            name: 'Pedido',
            dataModelEntityName: 'Pedido',
            attributes: [{ name: 'id', type: 'UUID' }],
          },
        ],
      },
      usage: null,
      latencyMs: 1,
    };
  },
};

// Domain class diagram and mandatory coherence (DEC-121, ADR-006).
describe('Class diagram integration', () => {
  let ctx: TestContext;
  let workspaceId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = { Authorization: '' };
  const newProject = async (name: string) => (await ctx.projects.create({ workspaceId, name })).id;

  beforeAll(async () => {
    ctx = await createTestContext({ aiProvider: incompleteAnswer });
    auth.Authorization = `Bearer ${ctx.token}`;
    workspaceId = (await createWorkspaceWithOwner(ctx, 'Clases')).id;
  });
  afterAll(async () => ctx.close());

  async function approvedDataModel(projectId: string) {
    const model = await ctx.dataModels.create(projectId, {
      title: 'Modelo',
      modelKind: 'ER',
      entities: [
        {
          localId: 'pedido',
          name: 'Pedido',
          attributes: [
            { name: 'id', type: 'UUID', required: true, primaryKey: true, unique: true },
            { name: 'cliente', type: 'TEXT', required: true, primaryKey: false, unique: false },
          ],
        },
      ],
      relationships: [],
    });
    await ctx.dataModels.transition(projectId, model.id, model.version.id, 'IN_REVIEW');
    await ctx.dataModels.transition(projectId, model.id, model.version.id, 'APPROVED');
    return model;
  }

  it('creates class diagrams with their code and a rendered Mermaid diagram, and audits approval', async () => {
    const projectId = await newProject('Clases HTTP');
    const created = await http()
      .post(`/projects/${projectId}/class-diagram`)
      .set(auth)
      .send({ title: 'Clases', content: CONTENT.CLASS_DIAGRAM })
      .expect(201);
    expect(created.body).toMatchObject({ code: 'DC-001', kind: 'CLASS_DIAGRAM' });
    const diagram = await ctx.structuredAnalysis.getDiagram(
      projectId,
      'CLASS_DIAGRAM',
      created.body.id,
    );
    expect(diagram).toMatchObject({ kind: 'CLASS_DIAGRAM', sourceFormat: 'MERMAID_CLASS' });
    expect(diagram.source).toContain('class order["Pedido"]');

    const transition = (status: string) =>
      http()
        .post(
          `/projects/${projectId}/class-diagram/${created.body.id}/versions/${created.body.version.id}/transition`,
        )
        .set(auth)
        .send({ status });
    await transition('IN_REVIEW').expect(201);
    await transition('APPROVED').expect(201);
    const events = await ctx.prisma.auditEvent.findMany({
      where: { entityId: created.body.version.id },
    });
    expect(events).toEqual([
      expect.objectContaining({ action: 'CLASS_DIAGRAM_APPROVED', actorUserId: ctx.userId }),
    ]);

    // Rejected by the schema: a relationship to a class that does not exist.
    await http()
      .post(`/projects/${projectId}/class-diagram`)
      .set(auth)
      .send({
        title: 'Roto',
        content: {
          ...CONTENT.CLASS_DIAGRAM,
          relationships: [{ fromLocalId: 'order', toLocalId: 'nadie', kind: 'ASSOCIATION' }],
        },
      })
      .expect(400);
  });

  it('refuses an AI proposal that leaves data-model attributes uncovered', async () => {
    const projectId = await newProject('Cobertura');
    const model = await approvedDataModel(projectId);
    const generation = await ctx.structuredAnalysis.generate(projectId, 'CLASS_DIAGRAM', [
      model.version.id,
    ]);
    const candidate = generation.candidates[0]!;
    expect(candidate.qualityFindings).toContainEqual(
      expect.objectContaining({
        severity: 'ERROR',
        code: 'COVERAGE_GAP',
        message: 'A la clase «Pedido» le falta el atributo «cliente» de la entidad «Pedido».',
      }),
    );
    await expect(
      ctx.structuredAnalysis.accept(projectId, 'CLASS_DIAGRAM', generation.id, [candidate.id]),
    ).rejects.toThrow('le falta cubrir elementos obligatorios');
  });

  it('only warns in projects created before mandatory coherence', async () => {
    const projectId = await newProject('Anterior');
    // What the migration does to every existing row.
    await ctx.prisma.project.update({
      where: { id: projectId },
      data: { coherenceRequired: false },
    });
    const model = await approvedDataModel(projectId);
    const generation = await ctx.structuredAnalysis.generate(projectId, 'CLASS_DIAGRAM', [
      model.version.id,
    ]);
    const candidate = generation.candidates[0]!;
    expect(candidate.qualityFindings).toContainEqual(
      expect.objectContaining({ severity: 'WARNING', code: 'COVERAGE_GAP' }),
    );
    await ctx.structuredAnalysis.accept(projectId, 'CLASS_DIAGRAM', generation.id, [candidate.id]);

    const readiness = await ctx.readiness.evaluate(projectId);
    expect(readiness.stages.find((s) => s.key === 'CLASS_DIAGRAM')).toMatchObject({
      satisfied: true,
      summary: 'El diagrama de clases es opcional en este proyecto.',
    });
  });

  it('requires the class diagram in the Design Baseline of new projects', async () => {
    const projectId = await newProject('Diseño');
    const row = await ctx.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(row.coherenceRequired).toBe(true);

    const { CLASS_DIAGRAM: classDiagram, ...versions } = await freezableDesign(ctx, projectId);
    const missing = await http()
      .post(`/projects/${projectId}/design-baselines`)
      .set(auth)
      .send({ label: 'Diseño', versions })
      .expect(422);
    expect(missing.body.message).toBe('Seleccione el diagrama de clases aprobado del proyecto.');

    const frozen = await http()
      .post(`/projects/${projectId}/design-baselines`)
      .set(auth)
      .send({ label: 'Diseño', versions: { ...versions, CLASS_DIAGRAM: classDiagram } })
      .expect(201);
    expect(frozen.body.entries.map((e: { role: string }) => e.role)).toContain('CLASS_DIAGRAM');
  });

  it('keeps class diagrams invisible to non-members', async () => {
    const projectId = await newProject('Privado');
    const intruder = await createUnauthorizedUser(ctx);
    await http()
      .get(`/projects/${projectId}/class-diagram`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);
  });
});
