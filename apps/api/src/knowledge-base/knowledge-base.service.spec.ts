import { describe, expect, it, vi } from 'vitest';
import { KnowledgeBaseService, formatHit, searchTerms } from './knowledge-base.service';
import type { PrismaService } from '../database/prisma.service';

describe('KnowledgeBaseService', () => {
  it('searches any of the meaningful words of a text', () => {
    expect(searchTerms('Registrar pedidos, registrar pagos y el stock!')).toBe(
      'registrar or pedidos or pagos or stock',
    );
    expect(searchTerms('a y de')).toBe('');
  });

  it('shows where each fragment comes from', () => {
    expect(formatHit({ sourceCode: 'SRC-001', section: 'Pedidos', content: 'Texto' })).toBe(
      '[SRC-001 › Pedidos] Texto',
    );
    expect(formatHit({ sourceCode: 'SRC-001', section: null, content: 'Texto' })).toBe(
      '[SRC-001] Texto',
    );
  });

  it('reads nothing without words to search or room to fill', async () => {
    const prisma = { $queryRaw: vi.fn(), project: { findUnique: vi.fn() } };
    const service = new KnowledgeBaseService(prisma as unknown as PrismaService);
    await expect(service.searchSources('p', 'y de', 1_000)).resolves.toEqual([]);
    await expect(service.searchSources('p', 'pedidos', 0)).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does nothing when indexing a version without extracted text', async () => {
    const prisma = {
      artifactVersion: { findFirst: vi.fn().mockResolvedValue({ sourceDetail: null }) },
      $transaction: vi.fn(),
    };
    await new KnowledgeBaseService(prisma as unknown as PrismaService).indexSource('p', 'v');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
