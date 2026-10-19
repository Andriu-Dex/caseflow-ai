import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { estimateTokens } from '@caseflow-ai/ai';
import { PrismaService } from '../database/prisma.service';
import { getProjectLanguage } from '../projects/project-language';
import { splitIntoSections } from './source-sections';

const logger = new Logger('KnowledgeBaseService');
// PostgreSQL text search configuration for each project language.
export const SEARCH_CONFIG = { ES: 'spanish', EN: 'english' } as const;

export interface SourceFragmentHit {
  sourceCode: string;
  section: string | null;
  content: string;
}

// How a fragment is shown to the model: where it comes from, then its text.
export const formatHit = (hit: SourceFragmentHit) =>
  `[${hit.sourceCode}${hit.section ? ` › ${hit.section}` : ''}] ${hit.content}`;

// Any of the text's words, so a fragment matching some of them still counts
// (ranked by how many and how close).
export function searchTerms(text: string): string {
  const words = new Set(
    text
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3),
  );
  return [...words].slice(0, 80).join(' or ');
}

@Injectable()
export class KnowledgeBaseService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The fragments of the project's approved sources most relevant to a text
   * (DEC-127): PostgreSQL full-text search in the project's language, ranked,
   * within a token budget. Only the latest approved version of each live
   * source counts, and only this project's fragments are ever read.
   */
  async searchSources(
    projectId: string,
    text: string,
    budgetTokens: number,
  ): Promise<SourceFragmentHit[]> {
    const terms = searchTerms(text);
    if (!terms || budgetTokens <= 0) return [];
    const config = SEARCH_CONFIG[await getProjectLanguage(this.prisma, projectId)];
    const rows = await this.prisma.$queryRaw<SourceFragmentHit[]>`
      SELECT artifact.code AS "sourceCode", fragment.section, fragment.content
      FROM "source_fragments" AS fragment
      JOIN "artifact_versions" AS version
        ON version.id = fragment.source_version_id AND version.project_id = fragment.project_id
      JOIN "artifacts" AS artifact
        ON artifact.id = version.artifact_id AND artifact.project_id = version.project_id,
        websearch_to_tsquery(${config}::regconfig, ${terms}) AS query
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
        AND fragment.search_vector @@ query
      ORDER BY ts_rank_cd(fragment.search_vector, query) DESC, artifact.code, fragment.sequence
      LIMIT 50`;
    const hits: SourceFragmentHit[] = [];
    let used = 0;
    for (const row of rows) {
      const tokens = estimateTokens(formatHit(row));
      if (used + tokens > budgetTokens) continue;
      hits.push(row);
      used += tokens;
    }
    return hits;
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
