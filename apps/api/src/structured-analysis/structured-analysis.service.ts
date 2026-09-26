import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import { canTransitionArtifactVersionStatus, formatArtifactCode } from '@caseflow-ai/domain';
import { DiagramProviderError, type DiagramProvider } from '@caseflow-ai/integrations';
import {
  STRUCTURED_ANALYSIS_CONTENT_SCHEMAS,
  type StructuredAnalysisKind,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { DiagramEngine, type DiagramFormat } from '../data-models/diagram-engine';
import { DIAGRAM_PROVIDER } from '../data-models/diagram-provider.token';
import { sanitizeDiagramSvg } from '../data-models/svg-sanitizer';

type Tx = Prisma.TransactionClient;
type Content = Record<string, unknown>;

interface KindConfig {
  promptKey: string;
  promptVersion: number;
  maxOutputTokens: number;
  diagram?: { format: DiagramFormat; generate: (content: Content) => string };
}

// One AI/HTTP/DB call per generation stays honest about which project
// materials are eligible sources for each kind (spec §13.2/§14.2/§15/§17.2).
const ELIGIBLE_SOURCE_TYPES: Record<StructuredAnalysisKind, string[]> = {
  NAVIGATION_TREE: ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL'],
  SOFTWARE_ARCHITECTURE: ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL', 'NAVIGATION_TREE'],
  SYSTEM_ARCHITECTURE: ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL', 'NAVIGATION_TREE'],
  UI_BLUEPRINT: [
    'NAVIGATION_TREE',
    'USE_CASE',
    'DATA_MODEL',
    'SOFTWARE_ARCHITECTURE',
    'SYSTEM_ARCHITECTURE',
  ],
};

const KIND_CONFIG: Record<StructuredAnalysisKind, KindConfig> = {
  NAVIGATION_TREE: {
    promptKey: 'navigation.generate',
    promptVersion: 1,
    maxOutputTokens: 4096,
    diagram: {
      format: 'MERMAID_FLOWCHART',
      generate: (content) =>
        new DiagramEngine().generateNavigationFlowchart({
          nodes: (
            content.nodes as { localId: string; label: string; parentLocalId?: string }[]
          ).map((node) => ({
            localId: node.localId,
            label: node.label,
            parentLocalId: node.parentLocalId,
          })),
        }),
    },
  },
  SOFTWARE_ARCHITECTURE: {
    promptKey: 'software-architecture.generate',
    promptVersion: 1,
    maxOutputTokens: 6144,
    diagram: {
      format: 'PLANTUML_COMPONENT',
      generate: (content) =>
        new DiagramEngine().generateSoftwareComponentDiagram({
          components: content.components as { localId: string; name: string }[],
          dependencies: content.dependencies as {
            fromLocalId: string;
            toLocalId: string;
            description?: string;
          }[],
        }),
    },
  },
  SYSTEM_ARCHITECTURE: {
    promptKey: 'system-architecture.generate',
    promptVersion: 1,
    maxOutputTokens: 6144,
    diagram: {
      format: 'PLANTUML_DEPLOYMENT',
      generate: (content) =>
        new DiagramEngine().generateSystemDeploymentDiagram({
          nodes: content.nodes as { localId: string; name: string; kind: string }[],
          links: content.links as {
            fromLocalId: string;
            toLocalId: string;
            description?: string;
          }[],
        }),
    },
  },
  UI_BLUEPRINT: {
    promptKey: 'ui-blueprint.generate',
    promptVersion: 1,
    maxOutputTokens: 8192,
  },
};

@Injectable()
export class StructuredAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
    private readonly diagrams: DiagramEngine,
    @Inject(DIAGRAM_PROVIDER) private readonly diagramProvider: DiagramProvider,
  ) {}

  async create(projectId: string, kind: StructuredAnalysisKind, title: string, content: Content) {
    const diagram = await this.renderDiagramIfApplicable(kind, content);
    return this.prisma.$transaction((tx) =>
      this.createInTx(tx, projectId, kind, title, content, diagram, 'MANUAL'),
    );
  }

  async list(projectId: string, kind: StructuredAnalysisKind) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: kind, archivedAt: null },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { structuredAnalysisDetail: true },
        },
      },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map((row) => this.map(row, row.versions[0]!)) };
  }

  async get(projectId: string, kind: StructuredAnalysisKind, id: string) {
    const row = await this.findLatest(projectId, kind, id);
    return this.map(row, row.versions[0]!);
  }

  // Exact-version lookup, used by Export (spec Phase H) which selects its own
  // authoritative version via FirstDeliverableSnapshotService rather than
  // always taking the latest version regardless of status (get() above).
  async getVersion(projectId: string, kind: StructuredAnalysisKind, id: string, versionId: string) {
    const row = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: kind },
      include: {
        versions: {
          where: { id: versionId },
          take: 1,
          include: { structuredAnalysisDetail: true },
        },
      },
    });
    if (!row?.versions[0]?.structuredAnalysisDetail)
      throw new NotFoundException('Artefacto no encontrado.');
    return this.map(row, row.versions[0]);
  }

  async version(
    projectId: string,
    kind: StructuredAnalysisKind,
    id: string,
    title: string,
    content: Content,
  ) {
    const diagram = await this.renderDiagramIfApplicable(kind, content);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM artifacts WHERE id=${id}::uuid AND project_id=${projectId}::uuid AND artifact_type_code=${kind} FOR NO KEY UPDATE`;
      if (!locked.length) throw new NotFoundException('Artefacto no encontrado.');
      const latest = await tx.artifactVersion.findFirstOrThrow({
        where: { artifactId: id },
        orderBy: { versionNumber: 'desc' },
      });
      const version = await tx.artifactVersion.create({
        data: {
          artifactId: id,
          projectId,
          versionNumber: latest.versionNumber + 1,
          title,
          status: 'DRAFT',
          origin: 'MANUAL',
        },
      });
      await this.insertDetail(tx, version.id, kind, content, diagram);
      return this.loadAndMap(tx, id, version.id);
    });
  }

  async generate(projectId: string, kind: StructuredAnalysisKind, sourceVersionIds: string[]) {
    const unique = [...new Set(sourceVersionIds)];
    if (unique.length !== sourceVersionIds.length)
      throw new UnprocessableEntityException('Las versiones fuente no pueden repetirse.');
    const sources = await this.prisma.artifactVersion.findMany({
      where: {
        id: { in: unique },
        projectId,
        status: 'APPROVED',
        artifact: { artifactTypeCode: { in: ELIGIBLE_SOURCE_TYPES[kind] } },
      },
      include: { artifact: true },
    });
    if (sources.length !== unique.length)
      throw new UnprocessableEntityException(
        'La generación requiere versiones exactas APPROVED de un tipo elegible del mismo proyecto.',
      );
    const config = KIND_CONFIG[kind];
    try {
      const result = await this.ai.generateStructured({
        projectId,
        promptKey: config.promptKey,
        promptVersion: config.promptVersion,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              sources: sources.map((source) => ({
                sourceId: source.id,
                type: source.artifact.artifactTypeCode,
                code: source.artifact.code,
              })),
            }),
          },
        ],
        outputSchema: STRUCTURED_ANALYSIS_CONTENT_SCHEMAS[kind] as unknown as z.ZodType<Content>,
        schemaName: `${kind.toLowerCase()}_generation`,
        maxOutputTokens: config.maxOutputTokens,
      });
      const generationId = await this.prisma.$transaction(async (tx) => {
        const generation = await tx.structuredAnalysisGeneration.create({
          data: { projectId, kind, aiRunId: result.metadata.runId },
        });
        await tx.structuredAnalysisGenerationSource.createMany({
          data: sources.map((source) => ({
            generationId: generation.id,
            artifactVersionId: source.id,
            sourceId: source.id,
          })),
        });
        await tx.structuredAnalysisCandidate.create({
          data: {
            generationId: generation.id,
            candidateId: 'candidate-1',
            title: `${kind} candidate`,
            content: result.data as Prisma.InputJsonValue,
          },
        });
        return generation.id;
      });
      return this.getGeneration(projectId, kind, generationId);
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }

  async getGeneration(projectId: string, kind: StructuredAnalysisKind, id: string) {
    const generation = await this.prisma.structuredAnalysisGeneration.findFirst({
      where: { id, projectId, kind },
      include: { sources: true, candidates: { orderBy: { candidateId: 'asc' } } },
    });
    if (!generation) throw new NotFoundException('Generación no encontrada.');
    return generation;
  }

  async accept(
    projectId: string,
    kind: StructuredAnalysisKind,
    generationId: string,
    candidateIds: string[],
  ) {
    const selected = new Set(candidateIds);
    const preview = await this.prisma.structuredAnalysisGeneration.findFirst({
      where: { id: generationId, projectId, kind },
      include: { candidates: true },
    });
    if (!preview) throw new NotFoundException('Generación no encontrada.');
    const previewCandidates = preview.candidates.filter((candidate) => selected.has(candidate.id));
    if (previewCandidates.length !== selected.size)
      throw new NotFoundException('Candidato no encontrado.');
    // Rendered before the write transaction opens (no network I/O under a
    // DB lock); a render failure aborts the whole batch, nothing is written.
    const diagrams = new Map<string, Awaited<ReturnType<typeof this.renderDiagramIfApplicable>>>();
    for (const candidate of previewCandidates) {
      const content = this.parseContent(kind, candidate.content);
      diagrams.set(candidate.id, await this.renderDiagramIfApplicable(kind, content));
    }
    return this.prisma.$transaction(async (tx) => {
      const generation = await tx.structuredAnalysisGeneration.findFirst({
        where: { id: generationId, projectId, kind },
        include: { candidates: true },
      });
      if (!generation) throw new NotFoundException('Generación no encontrada.');
      const candidates = generation.candidates.filter((candidate) => selected.has(candidate.id));
      if (candidates.length !== selected.size)
        throw new NotFoundException('Candidato no encontrado.');
      const items = [];
      for (const candidate of candidates) {
        if (candidate.acceptedArtifactId)
          throw new UnprocessableEntityException('El candidato ya fue aceptado.');
        const content = this.parseContent(kind, candidate.content);
        const created = await this.createInTx(
          tx,
          projectId,
          kind,
          candidate.title,
          content,
          diagrams.get(candidate.id)!,
          'AI_GENERATED',
          generation.id,
          candidate.id,
          generation.aiRunId,
        );
        await tx.structuredAnalysisCandidate.update({
          where: { id: candidate.id },
          data: { acceptedArtifactId: created.id },
        });
        items.push(created);
      }
      return { items };
    });
  }

  async transition(
    projectId: string,
    kind: StructuredAnalysisKind,
    artifactId: string,
    id: string,
    status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
  ) {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id, projectId, artifactId, artifact: { artifactTypeCode: kind } },
    });
    if (!version) throw new NotFoundException('Versión no encontrada.');
    if (!canTransitionArtifactVersionStatus(version.status, status))
      throw new UnprocessableEntityException('Transición de estado no permitida.');
    return this.prisma.artifactVersion.update({
      where: { id },
      data: {
        status,
        submittedAt: status === 'IN_REVIEW' ? new Date() : version.submittedAt,
        approvedAt: status === 'APPROVED' ? new Date() : version.approvedAt,
      },
    });
  }

  async getDiagram(projectId: string, kind: StructuredAnalysisKind, id: string) {
    if (!KIND_CONFIG[kind].diagram)
      throw new NotFoundException('Este tipo de artefacto no tiene diagrama.');
    const row = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: kind },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { diagramDetail: { include: { sources: true } } },
        },
      },
    });
    const version = row?.versions[0];
    const diagram = version?.diagramDetail;
    if (!row || !version || !diagram) throw new NotFoundException('Diagrama no encontrado.');
    return this.mapDiagram(row, version, diagram);
  }

  // Exact-version diagram lookup, used by Export (spec Phase H): the diagram
  // must be bound to the exact selected authoritative version, never to
  // whatever version happens to be latest (getDiagram() above).
  async getDiagramForVersion(
    projectId: string,
    kind: StructuredAnalysisKind,
    id: string,
    versionId: string,
  ) {
    if (!KIND_CONFIG[kind].diagram)
      throw new NotFoundException('Este tipo de artefacto no tiene diagrama.');
    const row = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: kind },
      include: {
        versions: {
          where: { id: versionId },
          take: 1,
          include: { diagramDetail: { include: { sources: true } } },
        },
      },
    });
    const version = row?.versions[0];
    const diagram = version?.diagramDetail;
    if (!row || !version || !diagram) throw new NotFoundException('Diagrama no encontrado.');
    return this.mapDiagram(row, version, diagram);
  }

  private mapDiagram(
    row: { id: string; projectId: string; code: string },
    version: { id: string },
    diagram: {
      kind: string;
      sourceFormat: string;
      source: string;
      svg: string;
      sources: { sourceArtifactVersionId: string }[];
    },
  ) {
    return {
      id: row.id,
      projectId: row.projectId,
      code: row.code,
      versionId: version.id,
      kind: diagram.kind,
      sourceFormat: diagram.sourceFormat,
      source: diagram.source,
      svg: diagram.svg,
      sourceArtifactVersionIds: diagram.sources.map((source) => source.sourceArtifactVersionId),
    };
  }

  private parseContent(kind: StructuredAnalysisKind, raw: unknown): Content {
    const parsed = STRUCTURED_ANALYSIS_CONTENT_SCHEMAS[kind].safeParse(raw);
    if (!parsed.success)
      throw new UnprocessableEntityException('El candidato persistido no es válido.');
    return parsed.data as Content;
  }

  private async renderDiagramIfApplicable(
    kind: StructuredAnalysisKind,
    content: Content,
  ): Promise<{ source: string; svg: string; generatorVersion: string } | null> {
    const diagramConfig = KIND_CONFIG[kind].diagram;
    if (!diagramConfig) return null;
    const source = diagramConfig.generate(content);
    this.diagrams.validate(diagramConfig.format, source);
    try {
      const rendered = await this.diagramProvider.render({ format: diagramConfig.format, source });
      let svg: string;
      try {
        svg = sanitizeDiagramSvg(rendered.svg);
      } catch (cause) {
        throw new DiagramProviderError(
          'DIAGRAM_UNSAFE_OUTPUT',
          'El renderizador produjo contenido no seguro.',
          { cause },
        );
      }
      return {
        source,
        svg,
        generatorVersion: `caseflow-diagram-source-v1+${this.diagramProvider.id}`,
      };
    } catch (error) {
      if (error instanceof DiagramProviderError) {
        if (error.code === 'DIAGRAM_INVALID_SOURCE')
          throw new UnprocessableEntityException({ message: error.message, code: error.code });
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      }
      throw error;
    }
  }

  private async insertDetail(
    tx: Tx,
    versionId: string,
    kind: StructuredAnalysisKind,
    content: Content,
    diagram: { source: string; svg: string; generatorVersion: string } | null,
    generationId?: string,
    candidateId?: string,
    aiRunId?: string,
  ) {
    await tx.structuredAnalysisDetail.create({
      data: {
        artifactVersionId: versionId,
        kind,
        content: content as Prisma.InputJsonValue,
        generationId,
        generationCandidateId: candidateId,
        aiRunId,
      },
    });
    const diagramConfig = KIND_CONFIG[kind].diagram;
    if (diagram && diagramConfig) {
      await tx.diagramDetail.create({
        data: {
          artifactVersionId: versionId,
          // Guarded by `diagramConfig` above: only kinds with a diagram
          // mapping (never UI_BLUEPRINT) reach this branch.
          kind: kind as Exclude<StructuredAnalysisKind, 'UI_BLUEPRINT'>,
          sourceFormat: diagramConfig.format,
          generatorVersion: diagram.generatorVersion,
          source: diagram.source,
          svg: diagram.svg,
          sources: { create: { sourceArtifactVersionId: versionId } },
        },
      });
    }
  }

  private async createInTx(
    tx: Tx,
    projectId: string,
    kind: StructuredAnalysisKind,
    title: string,
    content: Content,
    diagram: { source: string; svg: string; generatorVersion: string } | null,
    origin: 'MANUAL' | 'AI_GENERATED',
    generationId?: string,
    candidateId?: string,
    aiRunId?: string,
  ) {
    if (!(await tx.project.findUnique({ where: { id: projectId } })))
      throw new NotFoundException('Proyecto no encontrado.');
    const artifactType = await tx.artifactType.findUniqueOrThrow({ where: { code: kind } });
    const number = await this.allocate(tx, projectId, artifactType.defaultCodePrefix);
    const artifact = await tx.artifact.create({
      data: {
        projectId,
        artifactTypeCode: kind,
        code: formatArtifactCode(artifactType.defaultCodePrefix, number),
      },
    });
    const version = await tx.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        projectId,
        versionNumber: 1,
        title,
        status: origin === 'MANUAL' ? 'DRAFT' : 'GENERATED',
        origin,
      },
    });
    await this.insertDetail(
      tx,
      version.id,
      kind,
      content,
      diagram,
      generationId,
      candidateId,
      aiRunId,
    );
    return this.loadAndMap(tx, artifact.id, version.id);
  }

  private async findLatest(projectId: string, kind: StructuredAnalysisKind, id: string) {
    const row = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: kind },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { structuredAnalysisDetail: true },
        },
      },
    });
    if (!row?.versions[0]?.structuredAnalysisDetail)
      throw new NotFoundException('Artefacto no encontrado.');
    return row;
  }

  private async allocate(tx: Tx, projectId: string, prefix: string) {
    const rows = await tx.$queryRaw<
      { last_number: number }[]
    >`INSERT INTO project_code_counters(project_id,code_prefix,last_number) VALUES(${projectId}::uuid,${prefix},1) ON CONFLICT(project_id,code_prefix) DO UPDATE SET last_number=project_code_counters.last_number+1 RETURNING last_number`;
    return rows[0]!.last_number;
  }

  private async loadAndMap(tx: Tx, artifactId: string, versionId: string) {
    const artifact = await tx.artifact.findUniqueOrThrow({ where: { id: artifactId } });
    const version = await tx.artifactVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { structuredAnalysisDetail: true },
    });
    return this.map(artifact, version);
  }

  private map(
    artifact: { id: string; projectId: string; code: string; createdAt: Date },
    version: {
      id: string;
      versionNumber: number;
      status: string;
      origin: string;
      title: string;
      createdAt: Date;
      structuredAnalysisDetail: {
        kind: string;
        content: unknown;
        generationId: string | null;
        generationCandidateId: string | null;
        aiRunId: string | null;
      } | null;
    },
  ) {
    const detail = version.structuredAnalysisDetail!;
    return {
      id: artifact.id,
      projectId: artifact.projectId,
      code: artifact.code,
      kind: detail.kind,
      createdAt: artifact.createdAt.toISOString(),
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        origin: version.origin,
        createdAt: version.createdAt.toISOString(),
      },
      title: version.title,
      content: detail.content,
      generationId: detail.generationId,
      candidateId: detail.generationCandidateId,
      aiRunId: detail.aiRunId,
    };
  }
}
