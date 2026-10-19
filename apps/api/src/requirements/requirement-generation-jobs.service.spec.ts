import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { RequirementGenerationJobsService } from './requirement-generation-jobs.service';
import type { PrismaService } from '../database/prisma.service';
import type { RequirementsService } from './requirements.service';
import type { AuditService } from '../audit/audit.service';

const projectId = '00000000-0000-4000-8000-000000000002';
const contextId = '00000000-0000-4000-8000-000000000003';
const generationId = '00000000-0000-4000-8000-000000000004';
let row: {
  id: string;
  projectId: string;
  sourceContextVersionId: string;
  status: string;
  completedBatches: number;
  totalBatches: number;
  outputChars: number;
  generationId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};
let active = false;
let previous = false;
const prisma = {
  projectMembership: { findFirst: vi.fn() },
  project: { findUnique: vi.fn() },
  artifactVersion: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  requirementGenerationJob: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};
const requirements = { generate: vi.fn() };
const audit = { record: vi.fn() };
const service = () =>
  new RequirementGenerationJobsService(
    prisma as unknown as PrismaService,
    requirements as unknown as RequirementsService,
    audit as unknown as AuditService,
  );
beforeEach(() => {
  vi.resetAllMocks();
  active = previous = false;
  row = {
    id: '00000000-0000-4000-8000-000000000001',
    projectId,
    sourceContextVersionId: contextId,
    status: 'QUEUED',
    totalBatches: 0,
    completedBatches: 0,
    outputChars: 0,
    generationId: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  prisma.projectMembership.findFirst.mockResolvedValue({ role: 'OWNER' });
  prisma.project.findUnique.mockResolvedValue({ workflowRoute: 'FULL' });
  prisma.artifactVersion.findFirst.mockResolvedValue({ projectContextDetail: { sources: [{}] } });
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
  prisma.$queryRaw.mockResolvedValue([{ id: projectId }]);
  prisma.requirementGenerationJob.findFirst.mockImplementation(({ where }) => {
    if (where.status?.in?.includes('CANCELLED')) return previous ? row : null;
    if (where.status?.in) return active ? { ...row, status: 'RUNNING' } : null;
    if (where.projectId !== projectId) return null;
    return row;
  });
  prisma.requirementGenerationJob.create.mockImplementation(() => row);
  prisma.requirementGenerationJob.update.mockImplementation(({ data }) => {
    row = {
      ...row,
      ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
    };
    return row;
  });
  prisma.requirementGenerationJob.updateMany.mockImplementation(({ data }) => {
    row = { ...row, ...data };
    return { count: 1 };
  });
  requirements.generate.mockImplementation(async (_project, _context, progress) => {
    progress.update(0, 2, 50);
    progress.update(2, 2, 0);
    return { id: generationId };
  });
  audit.record.mockResolvedValue(undefined);
});
describe('Requirement generation job lifecycle', () => {
  it('finishes with progress, result and actor-scoped audit', async () => {
    const jobs = service();
    await jobs.start(projectId, contextId, 'user');
    await vi.waitFor(() => expect(row.status).toBe('COMPLETED'));
    expect(row).toMatchObject({ generationId, completedBatches: 2, totalBatches: 2 });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REQUIREMENT_GENERATION_FINISHED',
        actorUserId: 'user',
        metadata: { status: 'COMPLETED' },
      }),
      prisma,
    );
    expect((await jobs.latest(projectId)).job?.generationId).toBe(generationId);
    await expect(jobs.get('other-project', row.id)).rejects.toThrow('Trabajo no encontrado');
  });
  it('rejects unauthorized users and unapproved or foreign contexts before creating a job', async () => {
    const jobs = service();
    prisma.projectMembership.findFirst.mockResolvedValueOnce(null);
    await expect(jobs.start(projectId, contextId, 'viewer')).rejects.toThrow('No tiene permisos');
    prisma.artifactVersion.findFirst.mockResolvedValueOnce(null);
    await expect(jobs.start(projectId, contextId, 'user')).rejects.toThrow('contexto aprobado');
    expect(prisma.requirementGenerationJob.create).not.toHaveBeenCalled();
  });
  it('reuses an active job but refuses a different source context', async () => {
    active = true;
    const jobs = service();
    expect((await jobs.start(projectId, contextId, 'user')).id).toBe(row.id);
    await expect(jobs.start(projectId, generationId, 'user')).rejects.toThrow('otro contexto');
    expect(requirements.generate).not.toHaveBeenCalled();
  });
  it('recovers an already committed result without generating it again', async () => {
    previous = true;
    row.status = 'FAILED';
    row.generationId = generationId;
    expect((await service().start(projectId, contextId, 'user')).status).toBe('COMPLETED');
    expect(requirements.generate).not.toHaveBeenCalled();
    expect(prisma.requirementGenerationJob.create).not.toHaveBeenCalled();
  });
  it('preserves actionable public errors and conceals unexpected internal errors', async () => {
    requirements.generate.mockRejectedValueOnce(new ServiceUnavailableException('Puede reanudar.'));
    await service().start(projectId, contextId, 'user');
    await vi.waitFor(() => expect(row.status).toBe('FAILED'));
    expect(row.errorMessage).toBe('Puede reanudar.');
    previous = true;
    requirements.generate.mockRejectedValueOnce(new Error('private SQL and credentials'));
    await service().start(projectId, contextId, 'user');
    await vi.waitFor(() => expect(requirements.generate).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(row.status).toBe('FAILED'));
    expect(row.errorMessage).not.toContain('private');
  });
  it('cancels a running job: the run stops at its next batch and the job stays cancelled', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let stoppedBy: unknown = null;
    requirements.generate.mockImplementation(async (_project, _context, progress) => {
      progress.update(0, 2, 0);
      await gate;
      try {
        progress.update(1, 2, 0);
      } catch (error) {
        stoppedBy = error;
        throw error;
      }
      return { id: generationId };
    });
    const jobs = service();
    await jobs.start(projectId, contextId, 'user');
    await vi.waitFor(() => expect(requirements.generate).toHaveBeenCalled());
    row.status = 'RUNNING';
    await jobs.cancel(projectId, row.id, 'user');
    expect(row.status).toBe('CANCELLED');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REQUIREMENT_GENERATION_FINISHED',
        metadata: { status: 'CANCELLED' },
      }),
    );
    release();
    await vi.waitFor(() => expect(stoppedBy).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(row.status).toBe('CANCELLED');
    expect(row.generationId).toBeNull();
  });
  it('refuses to cancel for a user without permission', async () => {
    prisma.projectMembership.findFirst.mockResolvedValueOnce(null);
    await expect(service().cancel(projectId, row.id, 'viewer')).rejects.toThrow(
      'No tiene permisos',
    );
    expect(prisma.requirementGenerationJob.updateMany).not.toHaveBeenCalled();
  });
  it('closes interrupted jobs on startup and supports an empty history', async () => {
    const jobs = service();
    await jobs.onApplicationBootstrap();
    expect(prisma.requirementGenerationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    prisma.requirementGenerationJob.findFirst.mockResolvedValueOnce(null);
    expect(await jobs.latest(projectId)).toEqual({ job: null });
  });
});
