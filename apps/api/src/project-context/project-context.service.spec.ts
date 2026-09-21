import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { ProjectContextService } from './project-context.service';

const projectId = '7b1d3c4e-5f60-4a71-8b92-a3b4c5d6e7f8';
const artifactId = '9c2e4d5f-6071-4b82-9ca3-b4c5d6e7f809';
const now = new Date('2026-01-01T00:00:00.000Z');
const input = {
  problemStatement: 'Problema',
  objective: 'Objetivo',
  scopeItems: [{ type: 'IN_SCOPE' as const, description: 'Alcance' }],
  actors: [{ name: 'Analista' }],
  needs: [{ description: 'Necesidad' }],
  constraints: [{ description: 'Restricción' }],
  businessRules: [{ description: 'Regla' }],
};
const detail = {
  artifactVersionId: 'version-1',
  problemStatement: 'Problema',
  objective: 'Objetivo',
  additionalContext: null,
  actors: [
    {
      id: 'actor-1',
      artifactVersionId: 'version-1',
      position: 0,
      name: 'Analista',
      description: null,
    },
  ],
  needs: [{ id: 'need-1', artifactVersionId: 'version-1', position: 0, description: 'Necesidad' }],
  constraints: [
    { id: 'constraint-1', artifactVersionId: 'version-1', position: 0, description: 'Restricción' },
  ],
  businessRules: [
    { id: 'rule-1', artifactVersionId: 'version-1', position: 0, description: 'Regla' },
  ],
  scopeItems: [
    {
      id: 'scope-1',
      artifactVersionId: 'version-1',
      position: 0,
      type: 'IN_SCOPE',
      description: 'Alcance',
    },
  ],
};
const version = {
  id: 'version-1',
  artifactId,
  projectId,
  versionNumber: 1,
  title: 'Contexto del proyecto',
  status: 'DRAFT',
  origin: 'MANUAL',
  metadataAuxiliary: {},
  createdAt: now,
  submittedAt: null,
  approvedAt: null,
  projectContextDetail: detail,
};
const artifact = {
  id: artifactId,
  projectId,
  artifactTypeCode: 'PROJECT_CONTEXT',
  code: 'CTX-001',
  createdAt: now,
};

describe('ProjectContextService', () => {
  const tx = {
    project: { findUnique: vi.fn() },
    artifactType: { findUnique: vi.fn() },
    artifact: { findFirst: vi.fn(), create: vi.fn() },
    artifactVersion: { create: vi.fn(), aggregate: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    artifact: { findFirst: vi.fn() },
  };
  let service: ProjectContextService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    service = new ProjectContextService(prisma as unknown as PrismaService);
  });

  it('creates the artifact, code and complete version 1 snapshot', async () => {
    tx.project.findUnique.mockResolvedValue({ id: projectId });
    tx.artifact.findFirst.mockResolvedValue(null);
    tx.artifactType.findUnique.mockResolvedValue({
      code: 'PROJECT_CONTEXT',
      defaultCodePrefix: 'CTX',
    });
    tx.$queryRaw.mockResolvedValue([{ last_number: 1 }]);
    tx.artifact.create.mockResolvedValue(artifact);
    tx.artifactVersion.create.mockResolvedValue(version);

    const result = await service.create(projectId, input);

    expect(result.code).toBe('CTX-001');
    expect(result.version).toMatchObject({ versionNumber: 1, status: 'DRAFT', origin: 'MANUAL' });
    expect(tx.artifactVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId,
          versionNumber: 1,
          projectContextDetail: expect.any(Object),
        }),
      }),
    );
  });

  it('rejects a missing project and an existing canonical context', async () => {
    tx.project.findUnique.mockResolvedValue(null);
    await expect(service.create(projectId, input)).rejects.toMatchObject({ status: 404 });

    tx.project.findUnique.mockResolvedValue({ id: projectId });
    tx.artifact.findFirst.mockResolvedValue({ id: artifactId });
    await expect(service.create(projectId, input)).rejects.toMatchObject({ status: 409 });
  });

  it('maps a database uniqueness race to conflict', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });
    await expect(service.create(projectId, input)).rejects.toMatchObject({ status: 409 });
  });

  it('gets the current complete snapshot or returns 404', async () => {
    prisma.artifact.findFirst.mockResolvedValue({ ...artifact, versions: [version] });
    expect((await service.getCurrent(projectId)).problemStatement).toBe('Problema');
    prisma.artifact.findFirst.mockResolvedValue(null);
    await expect(service.getCurrent(projectId)).rejects.toMatchObject({ status: 404 });
  });

  it('locks the context artifact and creates the next version', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: artifactId, code: 'CTX-001' }]);
    tx.artifactVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 4 } });
    tx.artifactVersion.create.mockResolvedValue({ ...version, versionNumber: 5 });
    expect((await service.createVersion(projectId, input)).version.versionNumber).toBe(5);
  });

  it('returns 404 when versioning a project without context', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.createVersion(projectId, input)).rejects.toMatchObject({ status: 404 });
  });

  it('fails safely when the monotonic counter returns no row', async () => {
    tx.project.findUnique.mockResolvedValue({ id: projectId });
    tx.artifact.findFirst.mockResolvedValue(null);
    tx.artifactType.findUnique.mockResolvedValue({
      code: 'PROJECT_CONTEXT',
      defaultCodePrefix: 'CTX',
    });
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.create(projectId, input)).rejects.toMatchObject({ status: 500 });
  });
});
