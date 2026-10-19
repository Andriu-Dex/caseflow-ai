import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { CASEFLOW_WEB_TS_V1 } from '@caseflow-ai/domain';
import { DependencyCatalogService } from '../../src/construction/dependency-catalog.service';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';

const proposal = (overrides: Record<string, unknown> = {}) => ({
  targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
  targetTemplateVersion: 1,
  packageName: 'date-fns',
  version: '4.1.0',
  layer: 'FRONTEND',
  justification: 'Formateo de fechas relativas en el historial de pedidos.',
  ...overrides,
});

describe('Construction Foundation integration', () => {
  let ctx: TestContext;
  let projectId: string;
  let otherProjectId: string;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestContext();
    const workspace = await createWorkspaceWithOwner(ctx, 'Construction');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Q' })).id;
  });
  afterAll(async () => ctx.close());

  it('lists the read-only V1 template with its catalog and design system profile', async () => {
    const res = await http()
      .get('/target-templates')
      .set('Authorization', `Bearer ${ctx.token}`)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      identifier: 'CASEFLOW_WEB_TS_V1',
      version: 1,
      designSystemProfile: { identifier: 'CASEFLOW_STANDARD_WEB_V1' },
      validationStages: ['INSTALL', 'LINT', 'TYPECHECK', 'TEST', 'BUILD'],
    });
    await http()
      .get('/target-templates/CASEFLOW_WEB_TS_V1/versions/2')
      .set('Authorization', `Bearer ${ctx.token}`)
      .expect(404);
  });

  it('approves a project-scoped exception once and records both steps in the audit trail', async () => {
    const created = await http()
      .post(`/projects/${projectId}/dependency-proposals`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send(proposal())
      .expect(201);
    expect(created.body).toMatchObject({ status: 'PENDING', requestedByUserId: ctx.userId });

    await http()
      .post(`/projects/${projectId}/dependency-proposals`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send(proposal())
      .expect(409);

    const decided = await http()
      .post(`/projects/${projectId}/dependency-proposals/${created.body.id}/decide`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ decision: 'APPROVED', note: 'Sin alternativa en el catálogo.' })
      .expect(200);
    expect(decided.body).toMatchObject({ status: 'APPROVED', decidedByUserId: ctx.userId });

    await http()
      .post(`/projects/${projectId}/dependency-proposals/${created.body.id}/decide`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ decision: 'REJECTED' })
      .expect(409);

    const events = await ctx.prisma.auditEvent.findMany({
      where: { entityId: created.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.action)).toEqual([
      'DEPENDENCY_PROPOSAL_CREATED',
      'DEPENDENCY_PROPOSAL_DECIDED',
    ]);

    const catalog = ctx.app.get(DependencyCatalogService);
    expect(await catalog.resolve(projectId, CASEFLOW_WEB_TS_V1, 'date-fns')).toMatchObject({
      source: 'PROPOSAL',
      version: '4.1.0',
    });
    // The approval is an exception for that project only, never for the shared template.
    expect(await catalog.resolve(otherProjectId, CASEFLOW_WEB_TS_V1, 'date-fns')).toBeNull();
    expect(await catalog.resolve(otherProjectId, CASEFLOW_WEB_TS_V1, 'next')).toMatchObject({
      source: 'CATALOG',
    });
  });

  it('rejects packages already in the catalog, unsupported templates and inexact versions', async () => {
    const post = (body: Record<string, unknown>) =>
      http()
        .post(`/projects/${projectId}/dependency-proposals`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(body);
    await post(proposal({ packageName: 'react' })).expect(409);
    await post(proposal({ targetTemplateIdentifier: 'CASEFLOW_DJANGO_REACT' })).expect(422);
    await post(proposal({ packageName: 'lodash', version: '^4.17.0' })).expect(400);
    await post(proposal({ packageName: 'Bad Name!' })).expect(400);
  });

  it('keeps proposals invisible and undecidable across projects', async () => {
    const intruder = await createUnauthorizedUser(ctx);
    await http()
      .get(`/projects/${projectId}/dependency-proposals`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);

    const created = await http()
      .post(`/projects/${projectId}/dependency-proposals`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send(proposal({ packageName: 'papaparse', version: '5.5.3' }))
      .expect(201);
    // Knowing the id is not enough: decided through another project it does not exist.
    await http()
      .post(`/projects/${otherProjectId}/dependency-proposals/${created.body.id}/decide`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ decision: 'APPROVED' })
      .expect(404);
    const other = await http()
      .get(`/projects/${otherProjectId}/dependency-proposals`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .expect(200);
    expect(other.body.items).toEqual([]);
  });

  it('lets a rejected package be proposed again, keeping the rejection as history', async () => {
    const post = () =>
      http()
        .post(`/projects/${projectId}/dependency-proposals`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(proposal({ packageName: 'chart.js', version: '4.5.1' }));
    const first = await post().expect(201);
    await http()
      .post(`/projects/${projectId}/dependency-proposals/${first.body.id}/decide`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ decision: 'REJECTED' })
      .expect(200);
    await post().expect(201);
  });

  it('enforces append-only audit and final decisions at the database level', async () => {
    const event = await ctx.prisma.auditEvent.findFirstOrThrow({ where: { projectId } });
    await expect(
      ctx.sql.query(`UPDATE audit_events SET action = 'X' WHERE id = $1`, [event.id]),
    ).rejects.toThrow('append-only');
    await expect(
      ctx.sql.query(`DELETE FROM audit_events WHERE id = $1`, [event.id]),
    ).rejects.toThrow('append-only');

    const decided = await ctx.prisma.dependencyProposal.findFirstOrThrow({
      where: { projectId, status: { not: 'PENDING' } },
    });
    await expect(
      ctx.sql.query(`UPDATE dependency_proposals SET status = 'PENDING' WHERE id = $1`, [
        decided.id,
      ]),
    ).rejects.toThrow('final');
    await expect(
      ctx.sql.query(`DELETE FROM dependency_proposals WHERE id = $1`, [decided.id]),
    ).rejects.toThrow('cannot be deleted');
    await expect(
      ctx.sql.query(
        `INSERT INTO dependency_proposals
           (project_id, target_template_identifier, target_template_version, package_name, version, layer, justification, status)
         VALUES ($1, 'CASEFLOW_WEB_TS_V1', 1, 'zzz', '1.0.0', 'FRONTEND', 'justificación larga', 'APPROVED')`,
        [projectId],
      ),
    ).rejects.toThrow('decision_consistency');
  });
});
