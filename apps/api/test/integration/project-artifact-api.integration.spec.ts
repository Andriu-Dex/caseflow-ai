import {
  apiErrorResponseSchema,
  artifactResponseSchema,
  artifactVersionResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
} from '@caseflow-ai/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

describe('Project + Artifact HTTP API', () => {
  let ctx: TestContext;
  let workspaceId: string;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestContext();
    workspaceId = (await createWorkspace(ctx.prisma)).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('runs the full foundation flow: project, artifact, new version, read current', async () => {
    const created = await http()
      .post('/projects')
      .send({ workspaceId, name: 'Proyecto API', description: 'Vía HTTP' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;

    const listed = await http().get('/projects').query({ workspaceId });
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((item: { id: string }) => item.id)).toContain(projectId);

    const fetched = await http().get(`/projects/${projectId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);

    const artifactRes = await http()
      .post(`/projects/${projectId}/artifacts`)
      .send({ type: 'DATA_MODEL', title: 'Modelo inicial', metadataAuxiliary: { k: 'v' } });
    expect(artifactRes.status).toBe(201);
    expect(artifactRes.body).toMatchObject({
      projectId,
      type: 'DATA_MODEL',
      code: 'MD-001',
      currentVersion: { versionNumber: 1, status: 'DRAFT', origin: 'MANUAL' },
    });
    const artifactId = artifactRes.body.id as string;

    const versionRes = await http()
      .post(`/projects/${projectId}/artifacts/${artifactId}/versions`)
      .send({ title: 'RF editado' });
    expect(versionRes.status).toBe(201);
    expect(versionRes.body).toMatchObject({ artifactId, versionNumber: 2, title: 'RF editado' });

    const current = await http().get(`/projects/${projectId}/artifacts/${artifactId}`);
    expect(current.status).toBe(200);
    expect(current.body.id).toBe(artifactId);
    expect(current.body.currentVersion).toMatchObject({ versionNumber: 2, title: 'RF editado' });
  });

  it('does not expose an artifact through another project id', async () => {
    const a = (await http().post('/projects').send({ workspaceId, name: 'A' })).body.id as string;
    const b = (await http().post('/projects').send({ workspaceId, name: 'B' })).body.id as string;
    const artifact = await http()
      .post(`/projects/${a}/artifacts`)
      .send({ type: 'DATA_MODEL', title: 'Modelo' });

    const read = await http().get(`/projects/${b}/artifacts/${artifact.body.id}`);
    const write = await http()
      .post(`/projects/${b}/artifacts/${artifact.body.id}/versions`)
      .send({ title: 'intruso' });

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
  });

  it('validates input at the boundary with safe Spanish errors', async () => {
    const badProject = await http().post('/projects').send({ workspaceId: 'x', name: '' });
    expect(badProject.status).toBe(400);
    expect(badProject.body.message).toBe('La solicitud no es válida.');

    const project = (await http().post('/projects').send({ workspaceId, name: 'V' })).body.id;
    const unknownType = await http()
      .post(`/projects/${project}/artifacts`)
      .send({ type: 'NOT_A_TYPE', title: 't' });
    expect(unknownType.status).toBe(422);

    const smuggledOrigin = await http()
      .post(`/projects/${project}/artifacts`)
      .send({ type: 'DATA_MODEL', title: 't', origin: 'AI_GENERATED', status: 'APPROVED' });
    expect(smuggledOrigin.status).toBe(400);

    const missing = await http().get('/projects/00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);
    expect(JSON.stringify(missing.body)).not.toMatch(/prisma|select|stack/i);
  });

  // The published OpenAPI document is generated from these same schemas, so real
  // responses must conform to them.
  it('returns bodies that conform to the documented response contracts', async () => {
    const project = await http().post('/projects').send({ workspaceId, name: 'Contrato' });
    const projectId = project.body.id as string;
    const artifact = await http()
      .post(`/projects/${projectId}/artifacts`)
      .send({ type: 'DATA_MODEL', title: 'Modelo' });
    const version = await http()
      .post(`/projects/${projectId}/artifacts/${artifact.body.id}/versions`)
      .send({ title: 'Modelo v2' });
    const list = await http().get('/projects').query({ workspaceId });
    const read = await http().get(`/projects/${projectId}/artifacts/${artifact.body.id}`);

    expect(projectResponseSchema.safeParse(project.body).success).toBe(true);
    expect(projectListResponseSchema.safeParse(list.body).success).toBe(true);
    expect(artifactResponseSchema.safeParse(artifact.body).success).toBe(true);
    expect(artifactResponseSchema.safeParse(read.body).success).toBe(true);
    expect(artifactVersionResponseSchema.safeParse(version.body).success).toBe(true);

    const errors = [
      await http().post('/projects').send({ name: '' }),
      await http().get('/projects/00000000-0000-4000-8000-000000000000'),
      await http()
        .post(`/projects/${projectId}/artifacts`)
        .send({ type: 'NOT_A_TYPE', title: 't' }),
    ];
    expect(errors.map((response) => response.status)).toEqual([400, 404, 422]);
    for (const response of errors) {
      expect(apiErrorResponseSchema.safeParse(response.body).success).toBe(true);
    }
  });

  it('does not let a client choose the artifact code prefix', async () => {
    const project = (await http().post('/projects').send({ workspaceId, name: 'Prefijo' })).body.id;

    const response = await http()
      .post(`/projects/${project}/artifacts`)
      .send({ type: 'DATA_MODEL', title: 'prefijo falso', codePrefix: 'ALT' });

    expect(response.status).toBe(400);
  });
});
