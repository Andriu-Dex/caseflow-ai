import { Injectable } from '@nestjs/common';
import type {
  TraceabilityEdge,
  TraceabilityGeneration,
  TraceabilityGenerator,
  TraceabilityNode,
} from '@caseflow-ai/contracts';
import {
  TRACEABILITY_ARTIFACT_TYPES,
  TRACEABILITY_MAX_EDGES,
  TRACEABILITY_MAX_NODES,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';

type AIRunRow = {
  id: string;
  promptKey: string;
  promptVersion: number;
  provider: string;
  model: string | null;
  latencyMs: number | null;
  totalTokens: number | null;
};

function toGeneration(
  generationId: string | null,
  candidateId: string | null,
  aiRun: AIRunRow | null,
): TraceabilityGeneration | null {
  if (!aiRun) return null;
  return {
    generationId,
    candidateId,
    aiRunId: aiRun.id,
    promptKey: aiRun.promptKey,
    promptVersion: aiRun.promptVersion,
    provider: aiRun.provider,
    model: aiRun.model,
    latencyMs: aiRun.latencyMs,
    totalTokens: aiRun.totalTokens,
  };
}

@Injectable()
export class TraceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  // Every node/edge below is read directly from persisted exact-version
  // relationships — nothing is inferred from stage adjacency (spec Phase F).
  async buildGraph(
    projectId: string,
  ): Promise<{ nodes: TraceabilityNode[]; edges: TraceabilityEdge[]; truncated: boolean }> {
    const allVersions = await this.prisma.artifactVersion.findMany({
      where: {
        projectId,
        artifact: { artifactTypeCode: { in: [...TRACEABILITY_ARTIFACT_TYPES] } },
      },
      include: { artifact: true },
      orderBy: [{ artifact: { code: 'asc' } }, { versionNumber: 'asc' }],
      take: TRACEABILITY_MAX_NODES + 1,
    });
    if (!allVersions.length) return { nodes: [], edges: [], truncated: false };
    // Never silently drop nodes (spec closure item A): an explicit bound with
    // a visible `truncated` flag, not a complex graph-query engine.
    let truncated = allVersions.length > TRACEABILITY_MAX_NODES;
    const versions = truncated ? allVersions.slice(0, TRACEABILITY_MAX_NODES) : allVersions;

    const nodeIds = versions.map((v) => v.id);
    const maxVersionByArtifact = new Map<string, number>();
    for (const v of versions)
      maxVersionByArtifact.set(
        v.artifactId,
        Math.max(maxVersionByArtifact.get(v.artifactId) ?? 0, v.versionNumber),
      );

    const [
      requirementDetails,
      useCaseDetails,
      dataModelDetails,
      structuredAnalysisDetails,
      diagramDetails,
      mockupDetails,
    ] = await Promise.all([
      this.prisma.requirementDetail.findMany({
        where: { artifactVersionId: { in: nodeIds } },
        include: { aiRun: true },
      }),
      this.prisma.useCaseDetail.findMany({
        where: { artifactVersionId: { in: nodeIds } },
      }),
      this.prisma.dataModelDetail.findMany({
        where: { artifactVersionId: { in: nodeIds } },
        include: { aiRun: true },
      }),
      this.prisma.structuredAnalysisDetail.findMany({
        where: { artifactVersionId: { in: nodeIds } },
        include: { aiRun: true },
      }),
      this.prisma.diagramDetail.findMany({
        where: { artifactVersionId: { in: nodeIds } },
        select: { artifactVersionId: true, sourceFormat: true, generatorVersion: true },
      }),
      this.prisma.mockupDetail.findMany({
        where: { artifactVersionId: { in: nodeIds } },
        select: { artifactVersionId: true, generatorVersion: true },
      }),
    ]);

    // RequirementDetail/UseCaseDetail each lack one relation the others have
    // declared (no `generationCandidate` relation on RequirementDetail, no
    // `aiRun` relation on UseCaseDetail) — resolved with two small lookups.
    const requirementCandidateIds = requirementDetails
      .filter((d) => d.generationCandidateId)
      .map((d) => d.generationCandidateId!);
    const requirementCandidates = requirementCandidateIds.length
      ? await this.prisma.requirementCandidate.findMany({
          where: { id: { in: requirementCandidateIds } },
          select: { id: true, generationId: true },
        })
      : [];
    const requirementCandidateGenerationById = new Map(
      requirementCandidates.map((c) => [c.id, c.generationId]),
    );
    const useCaseAiRunIds = useCaseDetails.filter((d) => d.aiRunId).map((d) => d.aiRunId!);
    const useCaseAiRuns = useCaseAiRunIds.length
      ? await this.prisma.aIRun.findMany({ where: { id: { in: useCaseAiRunIds } } })
      : [];
    const useCaseAiRunById = new Map(useCaseAiRuns.map((r) => [r.id, r]));

    const generationByVersion = new Map<string, TraceabilityGeneration | null>();
    for (const d of requirementDetails)
      generationByVersion.set(
        d.artifactVersionId,
        toGeneration(
          d.generationCandidateId
            ? (requirementCandidateGenerationById.get(d.generationCandidateId) ?? null)
            : null,
          d.generationCandidateId,
          d.aiRun,
        ),
      );
    for (const d of useCaseDetails)
      generationByVersion.set(
        d.artifactVersionId,
        toGeneration(
          d.generationId,
          d.generationCandidateId,
          d.aiRunId ? (useCaseAiRunById.get(d.aiRunId) ?? null) : null,
        ),
      );
    for (const d of dataModelDetails)
      generationByVersion.set(
        d.artifactVersionId,
        toGeneration(d.generationId, d.generationCandidateId, d.aiRun),
      );
    for (const d of structuredAnalysisDetails)
      generationByVersion.set(
        d.artifactVersionId,
        toGeneration(d.generationId, d.generationCandidateId, d.aiRun),
      );

    const generatorByVersion = new Map<string, TraceabilityGenerator>();
    for (const d of diagramDetails)
      generatorByVersion.set(d.artifactVersionId, {
        sourceFormat: d.sourceFormat,
        generatorVersion: d.generatorVersion,
      });
    for (const d of mockupDetails)
      generatorByVersion.set(d.artifactVersionId, {
        sourceFormat: null,
        generatorVersion: d.generatorVersion,
      });

    const nodes: TraceabilityNode[] = versions.map((v) => ({
      id: v.id,
      artifactId: v.artifactId,
      artifactType: v.artifact.artifactTypeCode as TraceabilityNode['artifactType'],
      code: v.artifact.code,
      versionNumber: v.versionNumber,
      status: v.status,
      origin: v.origin,
      title: v.title,
      isCurrent: v.versionNumber === maxVersionByArtifact.get(v.artifactId),
      generation: generationByVersion.get(v.id) ?? null,
      generator: generatorByVersion.get(v.id) ?? null,
    }));

    const edges: TraceabilityEdge[] = [];
    const idSet = new Set(nodeIds);

    // SOURCE_SUPPORTS_CONTEXT
    const contextSources = await this.prisma.projectContextSource.findMany({
      where: { projectContextVersionId: { in: nodeIds }, sourceVersionId: { in: nodeIds } },
    });
    for (const link of contextSources)
      edges.push({
        type: 'SOURCE_SUPPORTS_CONTEXT',
        fromId: link.sourceVersionId,
        toId: link.projectContextVersionId,
      });

    // CONTEXT_SOURCE_FOR_REQUIREMENT
    for (const d of requirementDetails)
      if (d.sourceContextVersionId && idSet.has(d.sourceContextVersionId))
        edges.push({
          type: 'CONTEXT_SOURCE_FOR_REQUIREMENT',
          fromId: d.sourceContextVersionId,
          toId: d.artifactVersionId,
        });

    // REQUIREMENT_SOURCE_FOR_USE_CASE
    const useCaseLinks = await this.prisma.useCaseRequirementLink.findMany({
      where: { artifactVersionId: { in: nodeIds }, requirementVersionId: { in: nodeIds } },
    });
    for (const link of useCaseLinks)
      edges.push({
        type: 'REQUIREMENT_SOURCE_FOR_USE_CASE',
        fromId: link.requirementVersionId,
        toId: link.artifactVersionId,
      });

    // SOURCE_FOR_DATA_MODEL
    const dataModelGenerationIds = dataModelDetails
      .filter((d) => d.generationId)
      .map((d) => d.generationId!);
    if (dataModelGenerationIds.length) {
      const targetByGeneration = new Map(
        dataModelDetails
          .filter((d) => d.generationId)
          .map((d) => [d.generationId!, d.artifactVersionId]),
      );
      const sources = await this.prisma.dataModelGenerationSource.findMany({
        where: { generationId: { in: dataModelGenerationIds }, artifactVersionId: { in: nodeIds } },
      });
      for (const s of sources)
        edges.push({
          type: 'SOURCE_FOR_DATA_MODEL',
          fromId: s.artifactVersionId,
          toId: targetByGeneration.get(s.generationId)!,
        });
    }

    // SOURCE_FOR_DIAGRAM (only genuine cross-artifact case: Use Case Diagram)
    const diagramSources = await this.prisma.diagramSourceVersion.findMany({
      where: { diagramVersionId: { in: nodeIds }, sourceArtifactVersionId: { in: nodeIds } },
    });
    for (const s of diagramSources)
      if (s.sourceArtifactVersionId !== s.diagramVersionId)
        edges.push({
          type: 'SOURCE_FOR_DIAGRAM',
          fromId: s.sourceArtifactVersionId,
          toId: s.diagramVersionId,
        });

    // SOURCE_FOR_STRUCTURED_ANALYSIS
    const structuredGenerationIds = structuredAnalysisDetails
      .filter((d) => d.generationId)
      .map((d) => d.generationId!);
    if (structuredGenerationIds.length) {
      const targetByGeneration = new Map(
        structuredAnalysisDetails
          .filter((d) => d.generationId)
          .map((d) => [d.generationId!, d.artifactVersionId]),
      );
      const sources = await this.prisma.structuredAnalysisGenerationSource.findMany({
        where: {
          generationId: { in: structuredGenerationIds },
          artifactVersionId: { in: nodeIds },
        },
      });
      for (const s of sources)
        edges.push({
          type: 'SOURCE_FOR_STRUCTURED_ANALYSIS',
          fromId: s.artifactVersionId,
          toId: targetByGeneration.get(s.generationId)!,
        });
    }

    // UI_BLUEPRINT_SOURCE_FOR_MOCKUP
    const mockupLinks = await this.prisma.mockupDetail.findMany({
      where: { artifactVersionId: { in: nodeIds }, uiBlueprintVersionId: { in: nodeIds } },
    });
    for (const m of mockupLinks)
      edges.push({
        type: 'UI_BLUEPRINT_SOURCE_FOR_MOCKUP',
        fromId: m.uiBlueprintVersionId,
        toId: m.artifactVersionId,
      });

    if (edges.length > TRACEABILITY_MAX_EDGES) {
      truncated = true;
      edges.length = TRACEABILITY_MAX_EDGES;
    }
    return { nodes, edges, truncated };
  }
}
