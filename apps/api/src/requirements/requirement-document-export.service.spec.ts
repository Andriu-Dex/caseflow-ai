import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RequirementDocumentExportService } from './requirement-document-export.service';

function requirementItem(overrides: Partial<{ code: string; name: string }> = {}) {
  return {
    code: overrides.code ?? 'RF-001',
    version: { versionNumber: 1 },
    requirement: {
      requirementType: 'FUNCTIONAL' as const,
      name: overrides.name ?? 'Iniciar sesión',
      description: 'El sistema debe permitir iniciar sesión.',
      priority: 'HIGH' as const,
      actors: ['Usuario'],
      preconditions: ['Cuenta activa'],
      postconditions: ['Sesión iniciada'],
    },
  };
}

function service(items: ReturnType<typeof requirementItem>[]) {
  const prisma = {
    project: { findUnique: vi.fn().mockResolvedValue({ name: 'Proyecto Demo' }) },
  };
  const requirements = { listApproved: vi.fn().mockResolvedValue({ items }) };
  return new RequirementDocumentExportService(prisma as never, requirements as never);
}

describe('RequirementDocumentExportService', () => {
  it('rejects a non-existent project', async () => {
    const prisma = { project: { findUnique: vi.fn().mockResolvedValue(null) } };
    const requirements = { listApproved: vi.fn().mockResolvedValue({ items: [] }) };
    const svc = new RequirementDocumentExportService(prisma as never, requirements as never);
    await expect(svc.generate('missing-project', 'pdf')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('generates a well-formed PDF buffer for approved requirements', async () => {
    const buffer = await service([requirementItem()]).generate('p1', 'pdf');
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('generates a well-formed PDF buffer with no approved requirements', async () => {
    const buffer = await service([]).generate('p1', 'pdf');
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('generates a well-formed DOCX (zip) buffer for approved requirements', async () => {
    const buffer = await service([requirementItem(), requirementItem({ code: 'RF-002' })]).generate(
      'p1',
      'docx',
    );
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('generates a well-formed DOCX buffer with no approved requirements', async () => {
    const buffer = await service([]).generate('p1', 'docx');
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
