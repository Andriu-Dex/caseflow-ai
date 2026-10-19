import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SOURCE_LIMITS } from '@caseflow-ai/contracts';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

// DEC-127: a source's text may hold 500 000 characters, so a request carrying
// it (a manual transcript, a corrected text) must be accepted over HTTP.
describe('Long source text over HTTP', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => ctx.close());

  it('accepts a manual transcript as long as the source limit', async () => {
    const w = await createWorkspaceWithOwner(ctx, 'Long text');
    const projectId = (await ctx.projects.create({ workspaceId: w.id, name: 'Largo' })).id;
    const source = await ctx.sources.create(
      projectId,
      { title: 'Entrevista', sourceKind: 'TEXT', purpose: 'Transcribir', description: 'Notas.' },
      undefined,
    );
    // Accented text: about two bytes per character once encoded.
    const transcript = 'Ñandú í '.repeat(SOURCE_LIMITS.maxExtractedCharacters / 8);
    const res = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectId}/sources/${source.id}/manual-transcript`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ transcript });
    expect(res.status).toBe(201);
    expect((await ctx.sources.getText(projectId, source.id)).text).toHaveLength(
      transcript.trim().length,
    );
  });
});
