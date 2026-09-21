import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

// These tests bypass the services on purpose: they prove the rules hold in the
// database itself, so no future code path can violate them.
describe('Artifact database invariants', () => {
  let ctx: TestContext;
  let projectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const workspace = await createWorkspace(ctx.prisma);
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P1' })).id;
    otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P2' })).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function newArtifact(): Promise<{ artifactId: string; versionId: string }> {
    const artifact = await ctx.artifacts.createArtifact(projectId, {
      type: 'MOCKUP',
      title: 'Boceto',
      metadataAuxiliary: { a: 1 },
    });
    return { artifactId: artifact.id, versionId: artifact.currentVersion.id };
  }

  describe('cross-project misuse', () => {
    it('rejects a version whose project differs from its artifact project', async () => {
      const { artifactId } = await newArtifact();

      await expect(
        ctx.sql.query(
          `INSERT INTO artifact_versions
             (artifact_id, project_id, version_number, title, status, origin)
           VALUES ($1, $2, 2, 'cruzada', 'DRAFT', 'MANUAL')`,
          [artifactId, otherProjectId],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('rejects moving an artifact to another project', async () => {
      const { artifactId } = await newArtifact();

      await expect(
        ctx.sql.query('UPDATE artifacts SET project_id = $2 WHERE id = $1', [
          artifactId,
          otherProjectId,
        ]),
      ).rejects.toMatchObject({ code: '23001' });
    });

    it('rejects changing artifact type or code', async () => {
      const { artifactId } = await newArtifact();

      await expect(
        ctx.sql.query("UPDATE artifacts SET artifact_type_code = 'USE_CASE' WHERE id = $1", [
          artifactId,
        ]),
      ).rejects.toMatchObject({ code: '23001' });
      await expect(
        ctx.sql.query("UPDATE artifacts SET code = 'XX-999' WHERE id = $1", [artifactId]),
      ).rejects.toMatchObject({ code: '23001' });
    });

    it('rejects an artifact of an unknown type', async () => {
      await expect(
        ctx.sql.query(
          `INSERT INTO artifacts (project_id, artifact_type_code, code)
           VALUES ($1, 'NOT_A_TYPE', 'ZZ-001')`,
          [projectId],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  describe('version numbering', () => {
    it('rejects a duplicate version number for the same artifact', async () => {
      const { artifactId } = await newArtifact();

      await expect(
        ctx.sql.query(
          `INSERT INTO artifact_versions
             (artifact_id, project_id, version_number, title, status, origin)
           VALUES ($1, $2, 1, 'duplicada', 'DRAFT', 'MANUAL')`,
          [artifactId, projectId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('rejects a non-positive version number', async () => {
      const { artifactId } = await newArtifact();

      await expect(
        ctx.sql.query(
          `INSERT INTO artifact_versions
             (artifact_id, project_id, version_number, title, status, origin)
           VALUES ($1, $2, 0, 'cero', 'DRAFT', 'MANUAL')`,
          [artifactId, projectId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('immutability', () => {
    it('never deletes a version', async () => {
      const { versionId } = await newArtifact();

      await expect(
        ctx.sql.query('DELETE FROM artifact_versions WHERE id = $1', [versionId]),
      ).rejects.toMatchObject({ code: '23001' });
    });

    it('never edits version content in place', async () => {
      const { versionId } = await newArtifact();

      await expect(
        ctx.sql.query("UPDATE artifact_versions SET title = 'otro' WHERE id = $1", [versionId]),
      ).rejects.toThrow('immutable');
      await expect(
        ctx.sql.query(
          `UPDATE artifact_versions SET metadata_auxiliary = '{"a": 2}'::jsonb WHERE id = $1`,
          [versionId],
        ),
      ).rejects.toThrow('immutable');
      await expect(
        ctx.sql.query("UPDATE artifact_versions SET origin = 'IMPORTED' WHERE id = $1", [
          versionId,
        ]),
      ).rejects.toThrow('immutable');
      await expect(
        ctx.sql.query('UPDATE artifact_versions SET version_number = 9 WHERE id = $1', [versionId]),
      ).rejects.toThrow('immutable');

      const { rows } = await ctx.sql.query(
        'SELECT title, origin, version_number, metadata_auxiliary FROM artifact_versions WHERE id = $1',
        [versionId],
      );
      expect(rows[0]).toEqual({
        title: 'Boceto',
        origin: 'MANUAL',
        version_number: 1,
        metadata_auxiliary: { a: 1 },
      });
    });

    it('allows only lifecycle columns to change, and never once APPROVED', async () => {
      const { versionId } = await newArtifact();

      await ctx.sql.query(
        "UPDATE artifact_versions SET status = 'IN_REVIEW', submitted_at = now() WHERE id = $1",
        [versionId],
      );
      await ctx.sql.query(
        "UPDATE artifact_versions SET status = 'APPROVED', approved_at = now() WHERE id = $1",
        [versionId],
      );

      await expect(
        ctx.sql.query(
          "UPDATE artifact_versions SET status = 'CHANGES_REQUESTED', approved_at = NULL WHERE id = $1",
          [versionId],
        ),
      ).rejects.toThrow('approved artifact versions are immutable');
      await expect(
        ctx.sql.query('DELETE FROM artifact_versions WHERE id = $1', [versionId]),
      ).rejects.toMatchObject({ code: '23001' });

      const { rows } = await ctx.sql.query('SELECT status FROM artifact_versions WHERE id = $1', [
        versionId,
      ]);
      expect(rows[0]?.status).toBe('APPROVED');
    });

    it('keeps approved_at consistent with the APPROVED status', async () => {
      const { versionId } = await newArtifact();

      await expect(
        ctx.sql.query("UPDATE artifact_versions SET status = 'APPROVED' WHERE id = $1", [
          versionId,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('format constraints', () => {
    it('requires metadata_auxiliary to be a JSON object', async () => {
      const { artifactId } = await newArtifact();

      await expect(
        ctx.sql.query(
          `INSERT INTO artifact_versions
             (artifact_id, project_id, version_number, title, status, origin, metadata_auxiliary)
           VALUES ($1, $2, 2, 't', 'DRAFT', 'MANUAL', '[1]'::jsonb)`,
          [artifactId, projectId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('rejects malformed artifact codes and workspace slugs', async () => {
      await expect(
        ctx.sql.query(
          `INSERT INTO artifacts (project_id, artifact_type_code, code)
           VALUES ($1, 'REQUIREMENT', 'rf-1')`,
          [projectId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        ctx.sql.query("INSERT INTO workspaces (slug, name) VALUES ('Bad Slug', 'x')"),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });
});
