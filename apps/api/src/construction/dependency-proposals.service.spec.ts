import { describe, expect, it, vi } from 'vitest';
import { CASEFLOW_WEB_TS_V1 } from '@caseflow-ai/domain';
import type { PrismaService } from '../database/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { DependencyProposalsService } from './dependency-proposals.service';
import { DependencyCatalogService } from './dependency-catalog.service';

const now = new Date('2026-09-30T12:00:00Z');
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'proposal-1',
  projectId: 'project',
  targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
  targetTemplateVersion: 1,
  packageName: 'date-fns',
  version: '4.1.0',
  layer: 'FRONTEND',
  dev: false,
  justification: 'Formateo de fechas relativas.',
  status: 'PENDING',
  requestedByUserId: 'user',
  decidedByUserId: null,
  decidedAt: null,
  decisionNote: null,
  createdAt: now,
  ...overrides,
});
const input = {
  targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
  targetTemplateVersion: 1,
  packageName: 'date-fns',
  version: '4.1.0',
  layer: 'FRONTEND' as const,
  dev: false,
  justification: 'Formateo de fechas relativas.',
};

function setup() {
  const tx = {
    dependencyProposal: {
      create: vi.fn(async () => row()),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(async () =>
        row({ status: 'APPROVED', decidedByUserId: 'user', decidedAt: now }),
      ),
    },
  };
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    project: { findUnique: vi.fn(async (): Promise<{ id: string } | null> => ({ id: 'project' })) },
    dependencyProposal: { findMany: vi.fn(async () => [row()]), findFirst: vi.fn() },
  };
  const audit = { record: vi.fn() };
  const service = new DependencyProposalsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { tx, prisma, audit, service };
}

describe('DependencyProposalsService', () => {
  it('creates a pending proposal and audits it in the same transaction', async () => {
    const { service, tx, audit } = setup();
    const created = await service.create('project', 'user', input);
    expect(created).toMatchObject({ status: 'PENDING', createdAt: now.toISOString() });
    expect(tx.dependencyProposal.create).toHaveBeenCalledWith({
      data: { projectId: 'project', requestedByUserId: 'user', ...input },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEPENDENCY_PROPOSAL_CREATED', entityId: 'proposal-1' }),
      tx,
    );
  });

  it('refuses cataloged packages, unknown templates and missing projects before writing', async () => {
    const { service, prisma, tx } = setup();
    await expect(
      service.create('project', 'user', { ...input, packageName: 'next' }),
    ).rejects.toThrow('catálogo');
    await expect(
      service.create('project', 'user', { ...input, targetTemplateVersion: 9 }),
    ).rejects.toThrow('no está soportada');
    prisma.project.findUnique.mockResolvedValueOnce(null);
    await expect(service.create('missing', 'user', input)).rejects.toThrow('no encontrado');
    expect(tx.dependencyProposal.create).not.toHaveBeenCalled();
  });

  it('turns the one-active-proposal index violation into a conflict', async () => {
    const { service, tx } = setup();
    tx.dependencyProposal.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.create('project', 'user', input)).rejects.toThrow('Ya existe');
  });

  it('decides only a pending proposal of that project, once', async () => {
    const { service, tx, audit } = setup();
    const decided = await service.decide('project', 'proposal-1', 'user', { decision: 'APPROVED' });
    expect(decided.status).toBe('APPROVED');
    expect(tx.dependencyProposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proposal-1', projectId: 'project', status: 'PENDING' },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEPENDENCY_PROPOSAL_DECIDED' }),
      tx,
    );

    tx.dependencyProposal.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.decide('project', 'proposal-1', 'user', { decision: 'REJECTED' }),
    ).rejects.toThrow('ya fue decidida');

    tx.dependencyProposal.updateMany.mockResolvedValueOnce({ count: 0 });
    tx.dependencyProposal.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      service.decide('other', 'proposal-1', 'user', { decision: 'APPROVED' }),
    ).rejects.toThrow('no encontrada');
  });
});

describe('DependencyCatalogService', () => {
  it("allows the template catalog plus only this project's approved exceptions", async () => {
    const prisma = {
      dependencyProposal: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => [row({ status: 'APPROVED' })]),
      },
    };
    const catalog = new DependencyCatalogService(prisma as unknown as PrismaService);
    expect(await catalog.resolve('project', CASEFLOW_WEB_TS_V1, 'next')).toMatchObject({
      source: 'CATALOG',
      version: '16.3.5',
    });
    expect(await catalog.resolve('project', CASEFLOW_WEB_TS_V1, 'left-pad')).toBeNull();
    expect(prisma.dependencyProposal.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ projectId: 'project', status: 'APPROVED' }),
    });

    const allowed = await catalog.listAllowed('project', CASEFLOW_WEB_TS_V1);
    expect(allowed).toHaveLength(CASEFLOW_WEB_TS_V1.dependencies.length + 1);
    expect(allowed.at(-1)).toMatchObject({ name: 'date-fns', source: 'PROPOSAL' });
  });
});
