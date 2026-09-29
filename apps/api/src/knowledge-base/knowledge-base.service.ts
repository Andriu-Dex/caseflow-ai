import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RetrievalStrategy } from '@caseflow-ai/contracts';
import type { Prisma } from '../generated/prisma/client';
import { EmbeddingProvider } from '@caseflow-ai/integrations';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('EMBEDDING_PROVIDER') private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  /**
   * Retrieves context for a query based on strategy.
   * @param projectId - The ID of the project.
   * @param query - The string query.
   * @param strategy - The RetrievalStrategy to use.
   * @param queryEmbedding - the embedding vector of the query.
   */
  async retrieve(
    projectId: string,
    query: string,
    strategy: RetrievalStrategy,
    queryEmbedding?: number[]
  ): Promise<string[]> {
    if (strategy === 'NONE') {
      return [];
    }

    let embedding = queryEmbedding;
    if (!embedding) {
      const embeddings = await this.embeddingProvider.embed([query]);
      embedding = embeddings[0];
    }
    
    if (!embedding || embedding.length === 0) return [];


    // Determine target entity types based on strategy
    const entityTypes: string[] = [];
    if (strategy === 'ARTIFACT_ONLY' || strategy === 'HYBRID' || strategy === 'FULL_PROJECT') {
      entityTypes.push('ARTIFACT'); // Assuming 'ARTIFACT' is a type
    }
    if (strategy === 'SOURCE_ONLY' || strategy === 'HYBRID' || strategy === 'FULL_PROJECT') {
      entityTypes.push('SOURCE'); // Assuming 'SOURCE' is a type
    }

    // Construct the vector literal
    const embeddingString = `[${embedding.join(',')}]`;

    // Explicit projectId filtering to guarantee cross-project isolation.
    const fragments = await this.prisma.$queryRaw<
      { content: string; distance: number }[]
    >`
      SELECT 
        content, 
        embedding <-> ${embeddingString}::vector AS distance
      FROM "source_fragments"
      WHERE "project_id" = ${projectId}::uuid
      ORDER BY distance ASC
      LIMIT 10
    `;

    return fragments.map((f: { content: string; distance: number }) => f.content);
  }

  /**
   * Fragments a PROJECT_SOURCE version and stores its embeddings.
   * This should be called asynchronously after a source is approved.
   */
  async fragmentAndEmbedSource(projectId: string, sourceVersionId: string): Promise<void> {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id: sourceVersionId, projectId },
      include: { sourceDetail: true }
    });

    if (!version || !version.sourceDetail?.extractedText) {
      return;
    }

    // A very simple chunking strategy: split by paragraphs
    const paragraphs = version.sourceDetail.extractedText.split(/\n\s*\n/).filter((p: string) => p.trim().length > 0);
    if (paragraphs.length === 0) return;

    // Generate embeddings
    const embeddings = await this.embeddingProvider.embed(paragraphs);

    // Save to database
    // Assuming SourceFragment Prisma model is generated
    // Sequence starts at 1
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      const embeddingArray = embeddings[i];
      if (!embeddingArray) continue;
      const embeddingString = `[${embeddingArray.join(',')}]`;

      await this.prisma.$executeRaw`
        INSERT INTO "source_fragments" ("id", "source_version_id", "project_id", "sequence", "content", "embedding")
        VALUES (
          gen_random_uuid(), 
          ${sourceVersionId}::uuid, 
          ${projectId}::uuid, 
          ${i + 1}, 
          ${paragraph}, 
          ${embeddingString}::vector
        )
      `;
    }
  }
}

