import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RetrievalStrategy } from '@caseflow-ai/contracts';
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
    queryEmbedding?: number[],
  ): Promise<string[]> {
    if (strategy === 'NONE') {
      return [];
    }

    const results: string[] = [];
    if (strategy === 'ARTIFACT_ONLY' || strategy === 'HYBRID' || strategy === 'FULL_PROJECT') {
      const artifacts = await this.prisma.artifact.findMany({
        where: {
          projectId,
          archivedAt: null,
          artifactTypeCode: { not: 'PROJECT_SOURCE' },
          versions: { some: { status: 'APPROVED' } },
        },
        include: {
          versions: {
            where: { status: 'APPROVED' },
            orderBy: { versionNumber: 'desc' },
            take: 1,
            include: {
              requirementDetail: true,
              useCaseDetail: true,
              dataModelDetail: true,
              structuredAnalysisDetail: true,
            },
          },
        },
        orderBy: { code: 'asc' },
      });
      for (const artifact of artifacts) {
        const version = artifact.versions[0];
        if (!version) continue;
        const content =
          version.structuredAnalysisDetail?.content ??
          version.dataModelDetail ??
          version.requirementDetail ??
          version.useCaseDetail;
        results.push(
          `[${artifact.code}] ${version.title} (${artifact.artifactTypeCode}): ${JSON.stringify(content)}`,
        );
      }
    }

    if (strategy === 'ARTIFACT_ONLY') return results;

    if (strategy === 'FULL_PROJECT') {
      const fragments = await this.prisma.$queryRaw<{ content: string }[]>`
        SELECT fragment.content FROM "source_fragments" AS fragment
        JOIN "artifact_versions" AS version
          ON version.id = fragment.source_version_id
          AND version.project_id = fragment.project_id
        JOIN "artifacts" AS artifact
          ON artifact.id = version.artifact_id
          AND artifact.project_id = version.project_id
        WHERE fragment.project_id = ${projectId}::uuid
          AND version.status = 'APPROVED'
          AND artifact.artifact_type_code = 'PROJECT_SOURCE'
          AND artifact.archived_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "artifact_versions" AS newer
            WHERE newer.artifact_id = version.artifact_id
              AND newer.status = 'APPROVED'
              AND newer.version_number > version.version_number
          )
        ORDER BY artifact.code ASC, fragment.sequence ASC
        LIMIT 1000
      `;
      return [...results, ...fragments.map((fragment) => fragment.content)];
    }

    let embedding = queryEmbedding;
    if (!embedding) {
      const embeddings = await this.embeddingProvider.embed([query]);
      embedding = embeddings[0];
    }
    if (!embedding || embedding.length === 0) return results;

    // Construct the vector literal
    const embeddingString = `[${embedding.join(',')}]`;

    // Explicit projectId filtering to guarantee cross-project isolation.
    const fragments = await this.prisma.$queryRaw<{ content: string; distance: number }[]>`
      SELECT fragment.content,
        fragment.embedding <-> ${embeddingString}::vector AS distance
      FROM "source_fragments" AS fragment
      JOIN "artifact_versions" AS version
        ON version.id = fragment.source_version_id
        AND version.project_id = fragment.project_id
      JOIN "artifacts" AS artifact
        ON artifact.id = version.artifact_id
        AND artifact.project_id = version.project_id
      WHERE fragment.project_id = ${projectId}::uuid
        AND version.status = 'APPROVED'
        AND artifact.artifact_type_code = 'PROJECT_SOURCE'
        AND artifact.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "artifact_versions" AS newer
          WHERE newer.artifact_id = version.artifact_id
            AND newer.status = 'APPROVED'
            AND newer.version_number > version.version_number
        )
      ORDER BY distance ASC
      LIMIT 10
    `;

    return [...results, ...fragments.map((f: { content: string; distance: number }) => f.content)];
  }

  /**
   * Fragments a PROJECT_SOURCE version and stores its embeddings.
   * This should be called asynchronously after a source is approved.
   */
  async fragmentAndEmbedSource(projectId: string, sourceVersionId: string): Promise<void> {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id: sourceVersionId, projectId },
      include: { sourceDetail: true },
    });

    if (!version || !version.sourceDetail?.extractedText) {
      return;
    }

    // A very simple chunking strategy: split by paragraphs
    const paragraphs = version.sourceDetail.extractedText
      .split(/\n\s*\n/)
      .filter((p: string) => p.trim().length > 0);
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
