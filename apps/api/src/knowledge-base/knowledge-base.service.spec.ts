import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeBaseService } from './knowledge-base.service';
import { PrismaService } from '../database/prisma.service';
import { FakeEmbeddingProvider } from '@caseflow-ai/integrations';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let db: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: vi.fn(),
            $executeRaw: vi.fn(),
            artifactVersion: {
              findFirst: vi.fn(),
            },
          },
        },
        {
          provide: 'EMBEDDING_PROVIDER',
          useClass: FakeEmbeddingProvider,
        },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
    db = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('retrieve', () => {
    it('should return empty if strategy is NONE', async () => {
      const result = await service.retrieve('proj-1', 'query', 'NONE');
      expect(result).toEqual([]);
      expect(db.$queryRaw).not.toHaveBeenCalled();
    });

    it('should retrieve fragments filtering explicitly by projectId to ensure isolation', async () => {
      (db.$queryRaw as any).mockResolvedValue([
        { content: 'Context text', distance: 0.1 },
      ]);

      const result = await service.retrieve('proj-1', 'search text', 'HYBRID');
      expect(result).toEqual(['Context text']);
      
      const queryCallArgs = (db.$queryRaw as any).mock.calls[0];
      const queryStrings = queryCallArgs[0];
      const sqlString = queryStrings.join('?');
      // Verify isolation in query
      expect(sqlString).toContain('"project_id" = ');
      // Verify that the parameter matches the projectId
      expect(queryCallArgs[2]).toBe('proj-1');
    });
  });

  describe('fragmentAndEmbedSource', () => {
    it('should fragment text into paragraphs and store embeddings', async () => {
      (db.artifactVersion.findFirst as any).mockResolvedValue({
        id: 'ver-1',
        projectId: 'proj-1',
        sourceDetail: { extractedText: 'Para 1\n\nPara 2' }
      });
      (db.$executeRaw as any).mockResolvedValue(undefined);

      await service.fragmentAndEmbedSource('proj-1', 'ver-1');

      expect(db.$executeRaw).toHaveBeenCalledTimes(2);
      
      // Check first paragraph insert
      const call1 = (db.$executeRaw as any).mock.calls[0];
      expect(call1[0].join('?')).toContain('INSERT INTO "source_fragments"');
      expect(call1[4]).toBe('Para 1');

      // Check second paragraph insert
      const call2 = (db.$executeRaw as any).mock.calls[1];
      expect(call2[4]).toBe('Para 2');
    });

    it('should do nothing if no extracted text', async () => {
      (db.artifactVersion.findFirst as any).mockResolvedValue({
        id: 'ver-1',
        projectId: 'proj-1',
        sourceDetail: null
      });

      await service.fragmentAndEmbedSource('proj-1', 'ver-1');
      expect(db.$executeRaw).not.toHaveBeenCalled();
    });
  });
});
