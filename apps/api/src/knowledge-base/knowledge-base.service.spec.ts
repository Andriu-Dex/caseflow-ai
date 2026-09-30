import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeBaseService } from './knowledge-base.service';
import { PrismaService } from '../database/prisma.service';
import { FakeEmbeddingProvider } from '@caseflow-ai/integrations';

type MockFn = ReturnType<typeof vi.fn>;
type PrismaMock = {
  $queryRaw: MockFn;
  $executeRaw: MockFn;
  artifact: { findMany: MockFn };
  artifactVersion: { findFirst: MockFn };
};

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let db: PrismaMock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: vi.fn(),
            $executeRaw: vi.fn(),
            artifact: { findMany: vi.fn().mockResolvedValue([]) },
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
    db = module.get<PrismaService>(PrismaService) as unknown as PrismaMock;
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
      db.$queryRaw.mockResolvedValue([{ content: 'Context text', distance: 0.1 }]);

      const result = await service.retrieve('proj-1', 'search text', 'HYBRID');
      expect(result).toEqual(['Context text']);

      const queryCallArgs = db.$queryRaw.mock.calls[0] as unknown[];
      const queryStrings = queryCallArgs[0] as string[];
      const sqlString = queryStrings.join('?');
      // Verify isolation in query
      expect(sqlString).toContain('fragment.project_id = ');
      // Verify that the parameter matches the projectId
      expect(queryCallArgs[2]).toBe('proj-1');
    });

    it('retrieves approved artifact context without querying source fragments', async () => {
      db.artifact.findMany.mockResolvedValue([
        {
          code: 'RF-001',
          artifactTypeCode: 'REQUIREMENT',
          versions: [
            { title: 'Registrar usuario', requirementDetail: { statement: 'Crear cuenta' } },
          ],
        },
      ]);

      const result = await service.retrieve('proj-1', 'ignored', 'ARTIFACT_ONLY');

      expect(result[0]).toContain('[RF-001] Registrar usuario');
      expect(db.$queryRaw).not.toHaveBeenCalled();
      expect(db.artifact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ projectId: 'proj-1' }) }),
      );
    });

    it('loads full-project source fragments without needing embeddings', async () => {
      db.artifact.findMany.mockResolvedValue([]);
      db.$queryRaw.mockResolvedValue([{ content: 'Project source text' }]);

      await expect(service.retrieve('proj-1', 'ignored', 'FULL_PROJECT')).resolves.toEqual([
        'Project source text',
      ]);
      expect((db.$queryRaw.mock.calls[0]![0] as string[]).join(' ')).toContain(
        'ORDER BY artifact.code ASC, fragment.sequence ASC',
      );
      const queryText = (db.$queryRaw.mock.calls[0]![0] as string[]).join(' ');
      expect(queryText).toContain("artifact.artifact_type_code = 'PROJECT_SOURCE'");
      expect(queryText).toContain("version.status = 'APPROVED'");
      expect(queryText).toContain('NOT EXISTS');
    });
  });

  describe('fragmentAndEmbedSource', () => {
    it('should fragment text into paragraphs and store embeddings', async () => {
      db.artifactVersion.findFirst.mockResolvedValue({
        id: 'ver-1',
        projectId: 'proj-1',
        sourceDetail: { extractedText: 'Para 1\n\nPara 2' },
      });
      db.$executeRaw.mockResolvedValue(undefined);

      await service.fragmentAndEmbedSource('proj-1', 'ver-1');

      expect(db.$executeRaw).toHaveBeenCalledTimes(2);

      // Check first paragraph insert
      const call1 = db.$executeRaw.mock.calls[0] as unknown[];
      expect((call1[0] as string[]).join('?')).toContain('INSERT INTO "source_fragments"');
      expect(call1[4]).toBe('Para 1');

      // Check second paragraph insert
      const call2 = db.$executeRaw.mock.calls[1] as unknown[];
      expect(call2[4]).toBe('Para 2');
    });

    it('should do nothing if no extracted text', async () => {
      db.artifactVersion.findFirst.mockResolvedValue({
        id: 'ver-1',
        projectId: 'proj-1',
        sourceDetail: null,
      });

      await service.fragmentAndEmbedSource('proj-1', 'ver-1');
      expect(db.$executeRaw).not.toHaveBeenCalled();
    });
  });
});
