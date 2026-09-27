import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { getProjectLanguage } from './project-language';

describe('getProjectLanguage', () => {
  it('reads only the language of the requested project', async () => {
    const findUnique = vi.fn().mockResolvedValue({ language: 'EN' });
    const prisma = { project: { findUnique } } as unknown as PrismaService;

    await expect(getProjectLanguage(prisma, 'project-1')).resolves.toBe('EN');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      select: { language: true },
    });
  });

  it('rejects an unknown project', async () => {
    const prisma = {
      project: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    await expect(getProjectLanguage(prisma, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
