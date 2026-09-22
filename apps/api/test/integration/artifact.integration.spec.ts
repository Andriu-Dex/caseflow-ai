import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIRST_DELIVERABLE_ARTIFACT_TYPE_CODES } from '@caseflow-ai/domain';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

describe('Artifact + ArtifactVersion foundation', () => {
  let ctx: TestContext;
  let projectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const workspace = await createWorkspace(ctx.prisma);
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Proyecto A' })).id;
    otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Proyecto B' }))
      .id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('creation', () => {
    it('creates an artifact with a MANUAL DRAFT first version inside one project', async () => {
      const artifact = await ctx.artifacts.createArtifact(projectId, {
        type: 'USE_CASE',
        title: 'Registrar pedido',
        metadataAuxiliary: { note: 'inicial' },
      });

      expect(artifact.projectId).toBe(projectId);
      expect(artifact.type).toBe('USE_CASE');
      expect(artifact.code).toBe('CU-001');
      expect(artifact.currentVersion).toMatchObject({
        artifactId: artifact.id,
        versionNumber: 1,
        title: 'Registrar pedido',
        status: 'DRAFT',
        origin: 'MANUAL',
        metadataAuxiliary: { note: 'inicial' },
        submittedAt: null,
        approvedAt: null,
      });

      const stored = await ctx.prisma.artifactVersion.findMany({
        where: { artifactId: artifact.id },
      });
      expect(stored).toHaveLength(1);
      expect(stored[0]?.projectId).toBe(projectId);
    });

    it('persists origin and lifecycle status for every origin', async () => {
      const expectations = [
        ['MANUAL', 'DRAFT'],
        ['AI_GENERATED', 'GENERATED'],
        ['AI_ASSISTED', 'DRAFT'],
        ['IMPORTED', 'DRAFT'],
      ] as const;

      for (const [origin, status] of expectations) {
        const artifact = await ctx.artifacts.createArtifact(projectId, {
          type: 'USE_CASE',
          title: `CU ${origin}`,
          origin,
        });
        expect(artifact.currentVersion.origin).toBe(origin);
        expect(artifact.currentVersion.status).toBe(status);

        const row = await ctx.prisma.artifactVersion.findUniqueOrThrow({
          where: { id: artifact.currentVersion.id },
        });
        expect(row.origin).toBe(origin);
        expect(row.status).toBe(status);
      }
    });

    it('accepts generic first-deliverable artifact types', async () => {
      for (const type of FIRST_DELIVERABLE_ARTIFACT_TYPE_CODES.filter(
        (code) => code !== 'PROJECT_CONTEXT' && code !== 'REQUIREMENT',
      )) {
        const artifact = await ctx.artifacts.createArtifact(projectId, { type, title: type });
        expect(artifact.type).toBe(type);
      }
    });

    it('rejects an unknown artifact type', async () => {
      await expect(
        ctx.artifacts.createArtifact(projectId, { type: 'NOT_A_TYPE', title: 'x' }),
      ).rejects.toThrow('El tipo de artefacto no existe.');
    });

    it('rejects a missing project', async () => {
      await expect(
        ctx.artifacts.createArtifact('00000000-0000-4000-8000-000000000000', {
          type: 'USE_CASE',
          title: 'x',
        }),
      ).rejects.toThrow('Proyecto no encontrado.');
    });
  });

  describe('codes', () => {
    it('allocates sequential, project-scoped codes per prefix', async () => {
      const workspace = await createWorkspace(ctx.prisma);
      const project = await ctx.projects.create({ workspaceId: workspace.id, name: 'Códigos' });
      const other = await ctx.projects.create({ workspaceId: workspace.id, name: 'Otros códigos' });

      const codes: string[] = [];
      for (const [type, codePrefix] of [
        ['USE_CASE', undefined],
        ['USE_CASE', 'ALT'],
        ['USE_CASE', undefined],
        ['USE_CASE', undefined],
      ] as const) {
        const artifact = await ctx.artifacts.createArtifact(project.id, {
          type,
          title: 't',
          codePrefix,
        });
        codes.push(artifact.code);
      }
      const inOther = await ctx.artifacts.createArtifact(other.id, {
        type: 'USE_CASE',
        title: 't',
      });

      expect(codes).toEqual(['CU-001', 'ALT-001', 'CU-002', 'CU-003']);
      expect(inOther.code).toBe('CU-001');
    });

    it('never reuses a code, even when many artifacts are created concurrently', async () => {
      const workspace = await createWorkspace(ctx.prisma);
      const project = await ctx.projects.create({ workspaceId: workspace.id, name: 'Concurrente' });

      const created = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          ctx.artifacts.createArtifact(project.id, { type: 'USE_CASE', title: `r${index}` }),
        ),
      );

      const codes = created.map((artifact) => artifact.code).sort();
      expect(codes).toEqual(
        Array.from({ length: 8 }, (_, index) => `CU-${String(index + 1).padStart(3, '0')}`),
      );
    });
  });

  describe('versioning', () => {
    it('keeps artifact identity, appends sequential versions and preserves earlier ones', async () => {
      const artifact = await ctx.artifacts.createArtifact(projectId, {
        type: 'DATA_MODEL',
        title: 'Modelo v1',
        metadataAuxiliary: { revision: 1 },
      });
      const firstSnapshot = await ctx.prisma.artifactVersion.findUniqueOrThrow({
        where: { id: artifact.currentVersion.id },
      });

      const second = await ctx.artifacts.createVersion(projectId, artifact.id, {
        title: 'Modelo v2',
        metadataAuxiliary: { revision: 2 },
      });
      const third = await ctx.artifacts.createVersion(projectId, artifact.id, {
        title: 'Modelo v3',
      });

      expect(second.artifactId).toBe(artifact.id);
      expect([second.versionNumber, third.versionNumber]).toEqual([2, 3]);
      expect(second.status).toBe('DRAFT');
      expect(second.origin).toBe('MANUAL');

      const all = await ctx.prisma.artifactVersion.findMany({
        where: { artifactId: artifact.id },
        orderBy: { versionNumber: 'asc' },
      });
      expect(all.map((version) => version.versionNumber)).toEqual([1, 2, 3]);
      // The first version row is exactly what was persisted originally.
      expect(all[0]).toEqual(firstSnapshot);

      const resolved = await ctx.artifacts.getArtifact(projectId, artifact.id);
      expect(resolved.id).toBe(artifact.id);
      expect(resolved.code).toBe(artifact.code);
      expect(resolved.currentVersion.versionNumber).toBe(3);
      expect(resolved.currentVersion.title).toBe('Modelo v3');
    });

    it('assigns unique sequential numbers under concurrent version creation', async () => {
      const artifact = await ctx.artifacts.createArtifact(projectId, {
        type: 'NAVIGATION_TREE',
        title: 'Navegación',
      });

      await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          ctx.artifacts.createVersion(projectId, artifact.id, { title: `concurrent ${index}` }),
        ),
      );

      const numbers = (
        await ctx.prisma.artifactVersion.findMany({
          where: { artifactId: artifact.id },
          select: { versionNumber: true },
          orderBy: { versionNumber: 'asc' },
        })
      ).map((version) => version.versionNumber);
      expect(numbers).toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
    });

    it('never rewrites an APPROVED version: editing creates a new version', async () => {
      const artifact = await ctx.artifacts.createArtifact(projectId, {
        type: 'SOFTWARE_ARCHITECTURE',
        title: 'Arquitectura aprobada',
      });
      await ctx.sql.query(
        `UPDATE artifact_versions
         SET status = 'APPROVED', submitted_at = now(), approved_at = now()
         WHERE id = $1`,
        [artifact.currentVersion.id],
      );
      const approved = await ctx.prisma.artifactVersion.findUniqueOrThrow({
        where: { id: artifact.currentVersion.id },
      });

      const edited = await ctx.artifacts.createVersion(projectId, artifact.id, {
        title: 'Arquitectura editada',
      });

      expect(edited.versionNumber).toBe(2);
      expect(edited.status).toBe('DRAFT');
      const approvedAfter = await ctx.prisma.artifactVersion.findUniqueOrThrow({
        where: { id: approved.id },
      });
      expect(approvedAfter).toEqual(approved);
      expect(approvedAfter.status).toBe('APPROVED');
    });
  });

  describe('project isolation', () => {
    it('never resolves or versions an artifact through another project', async () => {
      const artifact = await ctx.artifacts.createArtifact(projectId, {
        type: 'UI_BLUEPRINT',
        title: 'Privado',
      });

      await expect(ctx.artifacts.getArtifact(otherProjectId, artifact.id)).rejects.toThrow(
        'Artefacto no encontrado.',
      );
      await expect(
        ctx.artifacts.createVersion(otherProjectId, artifact.id, { title: 'intruso' }),
      ).rejects.toThrow('Artefacto no encontrado.');

      const versions = await ctx.prisma.artifactVersion.count({
        where: { artifactId: artifact.id },
      });
      expect(versions).toBe(1);
    });
  });
});
