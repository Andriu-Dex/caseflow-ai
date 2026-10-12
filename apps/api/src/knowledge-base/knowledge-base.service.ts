import { Injectable, Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RetrievalStrategy } from '@caseflow-ai/contracts';
import { EmbeddingProvider } from '@caseflow-ai/integrations';
import { getProjectLanguage } from '../projects/project-language';
import { splitIntoSections } from './source-sections';

const logger = new Logger('KnowledgeBaseService');
// PostgreSQL text search configuration for each project language.
export const SEARCH_CONFIG = { ES: 'spanish', EN: 'english' } as const;

@Injectable()
export class KnowledgeBaseService implements OnApplicationBootstrap {
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
   * Splits an approved PROJECT_SOURCE version into sections (DEC-127) with a
   * full-text search vector in the project's language. Runs asynchronously
   * after a source is approved; running it again rebuilds the same fragments.
   */
  async indexSource(projectId: string, sourceVersionId: string): Promise<void> {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id: sourceVersionId, projectId },
      include: { sourceDetail: true },
    });
    if (!version?.sourceDetail?.extractedText) return;
    const config = SEARCH_CONFIG[await getProjectLanguage(this.prisma, projectId)];
    const sections = splitIntoSections(version.sourceDetail.extractedText);
    await this.prisma.$transaction(async (tx) => {
      // One rebuild at a time per version (approval and startup may overlap).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sourceVersionId}))`;
      await tx.$executeRaw`
        DELETE FROM "source_fragments"
        WHERE "project_id" = ${projectId}::uuid AND "source_version_id" = ${sourceVersionId}::uuid`;
      for (const [index, section] of sections.entries())
        await tx.$executeRaw`
          INSERT INTO "source_fragments"
            ("id", "source_version_id", "project_id", "sequence", "section", "content", "search_vector")
          VALUES (
            gen_random_uuid(),
            ${sourceVersionId}::uuid,
            ${projectId}::uuid,
            ${index + 1},
            ${section.heading},
            ${section.content},
            setweight(to_tsvector(${config}::regconfig, coalesce(${section.heading}, '')), 'A') ||
              to_tsvector(${config}::regconfig, ${section.content})
          )`;
    });
  }

  // Approved sources indexed before DEC-127 (paragraphs, no search vector)
  // are rebuilt once, at startup.
  async onApplicationBootstrap() {
    try {
      const pending = await this.prisma.$queryRaw<{ project_id: string; id: string }[]>`
        SELECT version.project_id, version.id
        FROM "artifact_versions" AS version
        JOIN "artifacts" AS artifact
          ON artifact.id = version.artifact_id AND artifact.project_id = version.project_id
        JOIN "source_details" AS detail ON detail.artifact_version_id = version.id
        WHERE artifact.artifact_type_code = 'PROJECT_SOURCE'
          AND version.status = 'APPROVED'
          AND detail.extracted_text IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "source_fragments" AS fragment
            WHERE fragment.source_version_id = version.id AND fragment.search_vector IS NOT NULL
          )`;
      for (const version of pending) await this.indexSource(version.project_id, version.id);
      if (pending.length) logger.log(`Indexed ${pending.length} approved source(s) by sections.`);
    } catch (error) {
      logger.warn(
        `Could not index approved sources: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
