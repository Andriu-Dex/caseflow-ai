import type { ApprovalOrigin } from '@caseflow-ai/contracts';
import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import { canTransitionArtifactVersionStatus, formatArtifactCode } from '@caseflow-ai/domain';
import { DiagramProviderError, type DiagramProvider } from '@caseflow-ai/integrations';
import {
  STRUCTURED_ANALYSIS_CONTENT_SCHEMAS,
  designThemeContentSchema,
  designThemeContrastIssues,
  designThemeGenerationOutputSchema,
  implementationPlanBodySchema,
  type StructuredAnalysisKind,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { provenanceGuard, sourceStatuses } from '../projects/source-statuses';
import { PrismaService } from '../database/prisma.service';
import { getProjectLanguage } from '../projects/project-language';
import type { Prisma } from '../generated/prisma/client';
import {
  DiagramEngine,
  type ClassDiagramModel,
  type DiagramFormat,
} from '../data-models/diagram-engine';
import { DIAGRAM_PROVIDER } from '../data-models/diagram-provider.token';
import { sanitizeDiagramSvg } from '../data-models/svg-sanitizer';
import {
  evaluateStructuredGeneration,
  type GenerationSourceReference,
} from './structured-generation-quality';
import { ConsistencyEngineService } from '../consistency-engine/consistency-engine.service';
import {
  COHERENCE_KINDS,
  coherenceChecklist,
  upstreamFromSources,
} from '../consistency-engine/coherence-rules';
import { AuditService, type AuditAction } from '../audit/audit.service';

type Tx = Prisma.TransactionClient;
type Content = Record<string, unknown>;

const KIND_LABELS: Record<StructuredAnalysisKind, string> = {
  NAVIGATION_TREE: 'Navegación',
  SOFTWARE_ARCHITECTURE: 'Arquitectura de software',
  SYSTEM_ARCHITECTURE: 'Arquitectura de sistema',
  UI_BLUEPRINT: 'Plano de interfaz',
  GENERATION_PLAN: 'Plan de generación',
  CONCEPTUAL_DOMAIN_MODEL: 'Modelo conceptual',
  IMPLEMENTATION_PLAN: 'Plan de implementación',
  DESIGN_THEME: 'Tema y colores',
  CLASS_DIAGRAM: 'Diagrama de clases',
};

// Construction gates whose approval is an audited event (AGENTS.md §35).
const APPROVAL_AUDIT_ACTIONS: Partial<Record<StructuredAnalysisKind, AuditAction>> = {
  GENERATION_PLAN: 'GENERATION_PLAN_APPROVED',
  CONCEPTUAL_DOMAIN_MODEL: 'CONCEPTUAL_DOMAIN_MODEL_APPROVED',
  IMPLEMENTATION_PLAN: 'IMPLEMENTATION_PLAN_APPROVED',
  DESIGN_THEME: 'DESIGN_THEME_APPROVED',
  CLASS_DIAGRAM: 'CLASS_DIAGRAM_APPROVED',
};

interface KindConfig {
  promptKey: string;
  promptVersion: number;
  maxOutputTokens: number;
  // What the AI proposes when the system fills part of the content itself.
  aiOutputSchema?: z.ZodType;
  maxContextChars?: number;
  // Splits one AI answer into several alternative candidates (default: one).
  candidates?: (data: Content) => Content[];
  diagram?: { format: DiagramFormat; generate: (content: Content) => string };
}

// One AI/HTTP/DB call per generation stays honest about which project
// materials are eligible sources for each kind (spec §13.2/§14.2/§15/§17.2).
export const ELIGIBLE_SOURCE_TYPES: Record<StructuredAnalysisKind, string[]> = {
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
  // spec §156: the plan is derived from the whole approved analysis and design.
  GENERATION_PLAN: [
    'REQUIREMENT',
    'USE_CASE',
    'DATA_MODEL',
    'CLASS_DIAGRAM',
    'NAVIGATION_TREE',
    'SOFTWARE_ARCHITECTURE',
    'SYSTEM_ARCHITECTURE',
    'UI_BLUEPRINT',
  ],
  // spec §157: the conceptual model refines the plan's conceptual entities.
  CONCEPTUAL_DOMAIN_MODEL: [
    'GENERATION_PLAN',
    'REQUIREMENT',
    'USE_CASE',
    'DATA_MODEL',
    'CLASS_DIAGRAM',
  ],
  // spec §161: built from what the approved Design Baseline froze (the mockup
  // itself carries no structured content, its UI blueprint does).
  IMPLEMENTATION_PLAN: [
    'GENERATION_PLAN',
    'CONCEPTUAL_DOMAIN_MODEL',
    'CLASS_DIAGRAM',
    'NAVIGATION_TREE',
    'UI_BLUEPRINT',
    'SOFTWARE_ARCHITECTURE',
    'SYSTEM_ARCHITECTURE',
  ],
  // DEC-118: the palette follows what the app is for and who uses it.
  DESIGN_THEME: ['REQUIREMENT', 'UI_BLUEPRINT'],
  // DEC-121: domain classes from the analysis, one per data-model entity.
  CLASS_DIAGRAM: ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL'],
};

const KIND_CONFIG: Record<StructuredAnalysisKind, KindConfig> = {
  NAVIGATION_TREE: {
    promptKey: 'navigation.generate',
    promptVersion: 4,
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
    promptVersion: 2,
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
    promptVersion: 2,
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
    promptVersion: 2,
    maxOutputTokens: 8192,
  },
  GENERATION_PLAN: {
    promptKey: 'generation-plan.generate',
    promptVersion: 1,
    maxOutputTokens: 8192,
  },
  CONCEPTUAL_DOMAIN_MODEL: {
    promptKey: 'conceptual-domain-model.generate',
    promptVersion: 2,
    maxOutputTokens: 8192,
  },
  IMPLEMENTATION_PLAN: {
    promptKey: 'implementation-plan.generate',
    promptVersion: 2,
    maxOutputTokens: 16384,
    aiOutputSchema: implementationPlanBodySchema,
    maxContextChars: 40_000,
  },
  CLASS_DIAGRAM: {
    promptKey: 'class-diagram.generate',
    promptVersion: 1,
    maxOutputTokens: 12_288,
    diagram: {
      format: 'MERMAID_CLASS',
      generate: (content) =>
        new DiagramEngine().generateClassDiagram(content as unknown as ClassDiagramModel),
    },
  },
  DESIGN_THEME: {
    promptKey: 'design-theme.generate',
    promptVersion: 1,
    maxOutputTokens: 4096,
    aiOutputSchema: designThemeGenerationOutputSchema,
    candidates: (data) => data.palettes as Content[],
  },
};

@Injectable()
export class StructuredAnalysisService {
  private readonly audit: AuditService;
  private readonly consistency: ConsistencyEngineService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
    private readonly diagrams: DiagramEngine,
    @Inject(DIAGRAM_PROVIDER) private readonly diagramProvider: DiagramProvider,
    // Injected by Nest; code constructing the service directly still audits.
    @Optional() audit?: AuditService,
    @Optional() consistency?: ConsistencyEngineService,
  ) {
    this.audit = audit ?? new AuditService(prisma);
    this.consistency = consistency ?? new ConsistencyEngineService(prisma);
  }

  async create(projectId: string, kind: StructuredAnalysisKind, title: string, content: Content) {
    await this.assertContentReferences(projectId, kind, content);
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
    await this.assertContentReferences(projectId, kind, content);
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

  async generate(
    projectId: string,
    kind: StructuredAnalysisKind,
    sourceVersionIds: string[],
    options: { designBaselineId?: string; instruction?: string } = {},
  ) {
    const unique = [...new Set(sourceVersionIds)];
    if (unique.length !== sourceVersionIds.length)
      throw new UnprocessableEntityException('Las versiones fuente no pueden repetirse.');
    // DEC-095: an Implementation Plan is derived only from the exact versions
    // an approved Design Baseline froze, never from an arbitrary selection.
    if (kind === 'IMPLEMENTATION_PLAN') {
      if (!options.designBaselineId)
        throw new UnprocessableEntityException(
          'Seleccione la línea base de diseño aprobada de la que parte el plan.',
        );
      const frozen = new Set(
        await this.designBaselineVersionIds(projectId, options.designBaselineId),
      );
      if (unique.some((id) => !frozen.has(id)))
        throw new UnprocessableEntityException(
          'Las fuentes deben ser versiones congeladas en la línea base de diseño seleccionada.',
        );
    }
    const sources = await this.prisma.artifactVersion.findMany({
      where: {
        id: { in: unique },
        projectId,
        status: { in: await sourceStatuses(this.prisma, projectId) },
        artifact: { artifactTypeCode: { in: ELIGIBLE_SOURCE_TYPES[kind] } },
      },
      include: {
        artifact: true,
        requirementDetail: {
          include: {
            actors: { orderBy: { position: 'asc' } },
            preconditions: { orderBy: { position: 'asc' } },
            postconditions: { orderBy: { position: 'asc' } },
          },
        },
        useCaseDetail: {
          include: {
            secondaryActors: { orderBy: { position: 'asc' } },
            preconditions: { orderBy: { position: 'asc' } },
            postconditions: { orderBy: { position: 'asc' } },
            mainFlowSteps: { orderBy: { position: 'asc' } },
            alternativeFlows: {
              orderBy: { position: 'asc' },
              include: { steps: { orderBy: { position: 'asc' } } },
            },
          },
        },
        dataModelDetail: {
          include: {
            entities: {
              orderBy: { position: 'asc' },
              include: { attributes: { orderBy: { position: 'asc' } } },
            },
            relationships: { orderBy: { position: 'asc' } },
          },
        },
        structuredAnalysisDetail: true,
      },
    });
    if (sources.length !== unique.length)
      throw new UnprocessableEntityException(
        'La generación requiere versiones exactas APPROVED de un tipo elegible del mismo proyecto.',
      );
    const contextSources = sources.map((source) => {
      const requirement = source.requirementDetail;
      const useCase = source.useCaseDetail;
      const model = source.dataModelDetail;
      const entityNames = new Map(model?.entities.map((entity) => [entity.id, entity.name]));
      return {
        sourceVersionId: source.id,
        type: source.artifact.artifactTypeCode,
        code: source.artifact.code,
        title: source.title,
        content: requirement
          ? {
              name: requirement.name,
              description: requirement.description,
              requirementType: requirement.requirementType,
              priority: requirement.priority,
              actors: requirement.actors.map((item) => item.name),
              preconditions: requirement.preconditions.map((item) => item.description),
              postconditions: requirement.postconditions.map((item) => item.description),
            }
          : useCase
            ? {
                name: useCase.name,
                objective: useCase.objective,
                primaryActor: useCase.primaryActor,
                secondaryActors: useCase.secondaryActors.map((item) => item.name),
                preconditions: useCase.preconditions.map((item) => item.description),
                postconditions: useCase.postconditions.map((item) => item.description),
                mainFlow: useCase.mainFlowSteps.map((step) => ({
                  actor: step.actor,
                  action: step.action,
                })),
                alternativeFlows: useCase.alternativeFlows.map((flow) => ({
                  name: flow.name,
                  condition: flow.condition,
                  steps: flow.steps.map((step) => ({ actor: step.actor, action: step.action })),
                })),
              }
            : model
              ? {
                  entities: model.entities.map((entity) => ({
                    name: entity.name,
                    description: entity.description,
                    attributes: entity.attributes.map((attribute) => ({
                      name: attribute.name,
                      type: attribute.type,
                      required: attribute.required,
                    })),
                  })),
                  relationships: model.relationships.map((relationship) => ({
                    name: relationship.name,
                    source: entityNames.get(relationship.sourceEntityId),
                    target: entityNames.get(relationship.targetEntityId),
                    sourceCardinality: relationship.sourceCardinality,
                    targetCardinality: relationship.targetCardinality,
                  })),
                }
              : source.structuredAnalysisDetail?.content,
      };
    });
    if (contextSources.some((source) => source.content === undefined))
      throw new UnprocessableEntityException(
        'Una fuente seleccionada no tiene contenido estructurado disponible.',
      );
    // DEC-121: the AI is told exactly what it must cover; the same rules
    // check the proposal afterwards.
    const mustCover = coherenceChecklist(kind, upstreamFromSources(contextSources));
    const serializedContext = JSON.stringify({
      sources: contextSources,
      ...(mustCover.length ? { mustCover } : {}),
    });
    const config = KIND_CONFIG[kind];
    if (serializedContext.length > (config.maxContextChars ?? 18_000))
      throw new UnprocessableEntityException(
        'Las fuentes seleccionadas exceden el límite de contexto. Seleccione menos versiones para esta generación.',
      );
    const language = await getProjectLanguage(this.prisma, projectId);
    try {
      const result = await this.ai.generateStructured({
        projectId,
        language,
        promptKey: config.promptKey,
        promptVersion: config.promptVersion,
        messages: [
          {
            role: 'user',
            content: serializedContext,
          },
          ...(options.instruction
            ? [
                {
                  role: 'user' as const,
                  content: `Ajuste solicitado por el usuario: ${options.instruction}`,
                },
              ]
            : []),
        ],
        outputSchema: (config.aiOutputSchema ??
          STRUCTURED_ANALYSIS_CONTENT_SCHEMAS[kind]) as unknown as z.ZodType<Content>,
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
        const contents = config.candidates?.(result.data) ?? [result.data];
        await tx.structuredAnalysisCandidate.createMany({
          data: contents.map((content, index) => ({
            generationId: generation.id,
            candidateId: `candidate-${index + 1}`,
            title:
              contents.length > 1
                ? `${KIND_LABELS[kind]} (candidato ${index + 1})`
                : `${KIND_LABELS[kind]} (candidato)`,
            content: (options.designBaselineId
              ? { ...content, designBaselineId: options.designBaselineId }
              : content) as Prisma.InputJsonValue,
          })),
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
    const sourceVersions = await this.prisma.artifactVersion.findMany({
      where: {
        id: { in: generation.sources.map((source) => source.artifactVersionId) },
        projectId,
      },
      include: {
        artifact: true,
        structuredAnalysisDetail: true,
        dataModelDetail: { include: { entities: { include: { attributes: true } } } },
      },
    });
    const references: GenerationSourceReference[] = sourceVersions.map((source) => ({
      code: source.artifact.code,
      type: source.artifact.artifactTypeCode,
      content:
        source.structuredAnalysisDetail?.content ??
        (source.dataModelDetail
          ? {
              entities: source.dataModelDetail.entities.map((entity) => ({
                name: entity.name,
                attributes: entity.attributes.map((attribute) => ({ name: attribute.name })),
              })),
            }
          : undefined),
    }));
    // DEC-121: coverage gaps block a proposal only where coherence is mandatory.
    const strict =
      (
        await this.prisma.project.findUnique({
          where: { id: projectId },
          select: { coherenceRequired: true },
        })
      )?.coherenceRequired ?? true;
    return {
      ...generation,
      candidates: generation.candidates.map((candidate) => ({
        ...candidate,
        qualityFindings: evaluateStructuredGeneration(kind, candidate.content, references, {
          strict,
        }),
      })),
    };
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
    const reviewed = await this.getGeneration(projectId, kind, generationId);
    if (
      reviewed.candidates.some(
        (candidate) =>
          selected.has(candidate.id) &&
          candidate.qualityFindings.some((finding) => finding.severity === 'ERROR'),
      )
    )
      throw new UnprocessableEntityException(
        'La propuesta contiene referencias inválidas o le falta cubrir elementos obligatorios. Corríjala o genere una nueva antes de incorporarla.',
      );
    // Rendered before the write transaction opens (no network I/O under a
    // DB lock); a render failure aborts the whole batch, nothing is written.
    const diagrams = new Map<string, Awaited<ReturnType<typeof this.renderDiagramIfApplicable>>>();
    for (const candidate of previewCandidates) {
      const content = this.parseContent(kind, candidate.content);
      await this.assertContentReferences(projectId, kind, content);
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
    actorUserId: string | null = null,
    // HUMAN_BULK for an EXPRESS bulk approval (DEC-116); otherwise the
    // database records HUMAN, or AUTOMATIC in BUILD_ONLY.
    approvalOrigin?: ApprovalOrigin,
  ) {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id, projectId, artifactId, artifact: { artifactTypeCode: kind } },
    });
    if (!version) throw new NotFoundException('Versión no encontrada.');
    if (!canTransitionArtifactVersionStatus(version.status, status))
      throw new UnprocessableEntityException('Transición de estado no permitida.');
    if (kind === 'DESIGN_THEME' && status === 'APPROVED') await this.assertAccessibleTheme(id);
    if (status === 'APPROVED' && COHERENCE_KINDS.has(kind))
      await this.consistency.assertCoherent(
        projectId,
        kind,
        (
          await this.prisma.structuredAnalysisDetail.findUniqueOrThrow({
            where: { artifactVersionId: id },
          })
        ).content,
      );
    return provenanceGuard(
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.artifactVersion.update({
          where: { id },
          data: {
            status,
            submittedAt: status === 'IN_REVIEW' ? new Date() : version.submittedAt,
            approvedAt: status === 'APPROVED' ? new Date() : version.approvedAt,
            approvalOrigin: status === 'APPROVED' ? approvalOrigin : undefined,
          },
        });
        const approvalAction = APPROVAL_AUDIT_ACTIONS[kind];
        if (status === 'APPROVED' && approvalAction)
          await this.audit.record(
            {
              projectId,
              actorUserId,
              action: approvalAction,
              entityType: 'ARTIFACT_VERSION',
              entityId: id,
              metadata: { artifactId, versionNumber: version.versionNumber },
            },
            tx,
          );
        return updated;
      }),
    );
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

  // Re-rendered on demand from the stored canonical source (spec §4.8), never
  // persisted: PNG export via client-side canvas rasterization is unreliable
  // for Mermaid output (Chromium taints the canvas for any SVG containing
  // `<foreignObject>`, which Mermaid emits for every flowchart edge label).
  async getDiagramPng(
    projectId: string,
    kind: StructuredAnalysisKind,
    id: string,
  ): Promise<Buffer> {
    const diagram = await this.getDiagram(projectId, kind, id);
    try {
      const { png } = await this.diagramProvider.renderPng({
        format: diagram.sourceFormat as DiagramFormat,
        source: diagram.source,
      });
      return png;
    } catch (error) {
      if (error instanceof DiagramProviderError) {
        if (error.code === 'DIAGRAM_INVALID_SOURCE')
          throw new UnprocessableEntityException({ message: error.message, code: error.code });
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      }
      throw error;
    }
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

  // The frozen versions of a Design Baseline this kind may use as sources.
  async generateFromDesignBaseline(
    projectId: string,
    kind: StructuredAnalysisKind,
    designBaselineId: string,
  ) {
    const frozen = await this.prisma.artifactVersion.findMany({
      where: {
        id: { in: await this.designBaselineVersionIds(projectId, designBaselineId) },
        artifact: { artifactTypeCode: { in: ELIGIBLE_SOURCE_TYPES[kind] } },
      },
      select: { id: true },
    });
    return this.generate(
      projectId,
      kind,
      frozen.map((version) => version.id),
      { designBaselineId },
    );
  }

  private async designBaselineVersionIds(projectId: string, designBaselineId: string) {
    const baseline = await this.prisma.designBaseline.findFirst({
      where: { id: designBaselineId, projectId },
      select: { entries: { select: { artifactVersionId: true } } },
    });
    if (!baseline)
      throw new UnprocessableEntityException(
        'Se requiere una línea base de diseño aprobada del mismo proyecto.',
      );
    return baseline.entries.map((entry) => entry.artifactVersionId);
  }

  // DEC-118: a palette below WCAG AA cannot be approved.
  private async assertAccessibleTheme(versionId: string) {
    const detail = await this.prisma.structuredAnalysisDetail.findUniqueOrThrow({
      where: { artifactVersionId: versionId },
    });
    const issues = designThemeContrastIssues(designThemeContentSchema.parse(detail.content));
    if (issues.length)
      throw new UnprocessableEntityException(
        `La paleta no cumple el contraste mínimo de accesibilidad (WCAG AA). ${issues[0]!.message}`,
      );
  }

  // References inside content that the schema alone cannot check.
  private async assertContentReferences(
    projectId: string,
    kind: StructuredAnalysisKind,
    content: Content,
  ) {
    if (kind === 'IMPLEMENTATION_PLAN')
      await this.designBaselineVersionIds(projectId, content.designBaselineId as string);
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
          // mapping reach this branch.
          kind: kind as
            'NAVIGATION_TREE' | 'SOFTWARE_ARCHITECTURE' | 'SYSTEM_ARCHITECTURE' | 'CLASS_DIAGRAM',
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
