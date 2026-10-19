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
  classBatchOutputSchema,
  classDiagramContentSchema,
  conceptualBatchOutputSchema,
  conceptualDomainModelContentSchema,
  generationPlanContentSchema,
  implementationEntityBatchOutputSchema,
  implementationRoutesBatchOutputSchema,
  implementationSkeletonSchema,
  navigationTreeContentSchema,
  planDetailBatchOutputSchema,
  planOutlineSchema,
  uiBlueprintContentSchema,
  uiBlueprintBatchOutputSchema,
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
import { createStepRunner, type StructuredGenerationProgress } from './structured-step-runner';
import {
  CONCEPTUAL_BATCH_ATTEMPTS,
  classesWithoutEntity,
  completeRelationships as completeConceptualRelationships,
  fillMissingEntities as fillMissingConceptualEntities,
  finishConceptualModel,
  mergeConceptualBatch,
  planConceptualBatches,
  relationshipsToCarry,
  type Accumulated as ConceptualDrawn,
} from './conceptual-model-batches';
import {
  completeRelationships,
  entitiesWithoutClass,
  fillMissingEntities,
  finishClassDiagram,
  mergeClassBatch,
  CLASS_BATCH_ATTEMPTS,
  planClassBatches,
  relationshipsToDraw,
  type Accumulated as ClassDrawn,
  type ModelEntity,
  type ModelRelationship,
} from './class-diagram-batches';
import {
  IP_BATCH_ATTEMPTS,
  addRelations,
  classesWithoutPlanEntity,
  cleanSkeleton,
  fillMissingEntities as fillMissingPlanEntities,
  fillMissingRoutes,
  finishImplementationPlan,
  finishRoutes,
  mergeEntityBatch,
  mergeRouteBatch,
  planEntityBatches,
  planRouteBatches,
  screensWithoutRoute,
  type IpEntity,
  type PlanContext,
  type RoutesAccumulated,
} from './implementation-plan-batches';
import {
  PLAN_BATCH_ATTEMPTS,
  cleanOutline,
  fillMissingScreens as fillMissingPlanScreens,
  finishGenerationPlan,
  mergePlanBatch,
  modulesWithoutScreen,
  planDetailBatches,
  type PlanAccumulated,
  type PlanCodes,
} from './generation-plan-batches';
import {
  UI_BATCH_ATTEMPTS,
  fillMissingScreens,
  finishUiBlueprint,
  mergeUiBatch,
  nodesWithoutScreen,
  planUiBatches,
  type Screen,
} from './ui-blueprint-batches';
import {
  fitToBudget,
  requirementLevels,
  useCaseLevels,
  type BudgetItem,
} from '../common/source-budget';
import type { Prisma } from '../generated/prisma/client';
import {
  DiagramEngine,
  type ClassDiagramModel,
  type SoftwareArchitectureDiagramModel,
  type SystemArchitectureDiagramModel,
  type DiagramFormat,
} from '../data-models/diagram-engine';
import { DIAGRAM_PROVIDER } from '../data-models/diagram-provider.token';
import { sanitizeDiagramSvg } from '../data-models/svg-sanitizer';
import { StageCurrencyService } from '../readiness/stage-currency';
import {
  evaluateStructuredGeneration,
  cleanSourceCodes,
  withUseCaseProvenance,
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

export type { StructuredGenerationProgress };

interface KindConfig {
  promptKey: string;
  promptVersion: number;
  maxOutputTokens: number;
  // What the AI proposes when the system fills part of the content itself.
  aiOutputSchema?: z.ZodType;
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

// maxOutputTokens is what the task needs at least; a provider that can write
// more is given its own ceiling (DEC-131). Sized for a project of a hundred
// requirements and use cases: an answer cut short is an invalid answer. The
// kinds that still go in one request keep this room until they are batched.
const KIND_CONFIG: Record<StructuredAnalysisKind, KindConfig> = {
  NAVIGATION_TREE: {
    promptKey: 'navigation.generate',
    promptVersion: 4,
    maxOutputTokens: 12_288,
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
    promptVersion: 3,
    maxOutputTokens: 12_288,
    diagram: {
      format: 'PLANTUML_COMPONENT',
      generate: (content) =>
        new DiagramEngine().generateSoftwareComponentDiagram(
          content as unknown as SoftwareArchitectureDiagramModel,
        ),
    },
  },
  SYSTEM_ARCHITECTURE: {
    promptKey: 'system-architecture.generate',
    promptVersion: 3,
    maxOutputTokens: 12_288,
    diagram: {
      format: 'PLANTUML_DEPLOYMENT',
      generate: (content) =>
        new DiagramEngine().generateSystemDeploymentDiagram(
          content as unknown as SystemArchitectureDiagramModel,
        ),
    },
  },
  UI_BLUEPRINT: {
    promptKey: 'ui-blueprint.generate',
    promptVersion: 2,
    maxOutputTokens: 16_384,
  },
  GENERATION_PLAN: {
    promptKey: 'generation-plan.generate',
    promptVersion: 1,
    maxOutputTokens: 16_384,
  },
  CONCEPTUAL_DOMAIN_MODEL: {
    promptKey: 'conceptual-domain-model.generate',
    promptVersion: 2,
    maxOutputTokens: 16_384,
  },
  IMPLEMENTATION_PLAN: {
    promptKey: 'implementation-plan.generate',
    promptVersion: 2,
    maxOutputTokens: 32_768,
    aiOutputSchema: implementationPlanBodySchema,
  },
  CLASS_DIAGRAM: {
    promptKey: 'class-diagram.generate',
    promptVersion: 2,
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
    @Optional() private readonly currency?: StageCurrencyService,
  ) {
    this.audit = audit ?? new AuditService(prisma);
    this.consistency = consistency ?? new ConsistencyEngineService(prisma);
  }

  async create(projectId: string, kind: StructuredAnalysisKind, title: string, content: Content) {
    if (['GENERATION_PLAN', 'CONCEPTUAL_DOMAIN_MODEL', 'IMPLEMENTATION_PLAN'].includes(kind))
      await this.currency?.assertCurrent(projectId);
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
    if (['GENERATION_PLAN', 'CONCEPTUAL_DOMAIN_MODEL', 'IMPLEMENTATION_PLAN'].includes(kind))
      await this.currency?.assertCurrent(projectId);
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
    if (['GENERATION_PLAN', 'CONCEPTUAL_DOMAIN_MODEL', 'IMPLEMENTATION_PLAN'].includes(kind))
      await this.currency?.assertCurrent(projectId);
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
    // DEC-140: the coverage rules above read the full analysis; only what is
    // sent to the model loses detail when it is too large for one call.
    type ContextSource = (typeof contextSources)[number];
    const asRecord = (value: unknown) => value as Record<string, unknown>;
    const sentSources = fitToBudget(
      contextSources.map((source): BudgetItem<ContextSource> =>
        source.type === 'REQUIREMENT'
          ? {
              kind: 'REQUIREMENT',
              levels: requirementLevels(asRecord(source.content)).map((content) => ({
                ...source,
                content,
              })) as ContextSource[],
            }
          : source.type === 'USE_CASE'
            ? {
                kind: 'USE_CASE',
                levels: useCaseLevels(asRecord(source.content)).map((content) => ({
                  ...source,
                  content,
                })) as ContextSource[],
              }
            : { kind: 'OTHER', levels: [source] },
      ),
    ).items;
    const serializedContext = JSON.stringify({
      sources: sentSources,
      ...(mustCover.length ? { mustCover } : {}),
    });
    const config = KIND_CONFIG[kind];
    // DEC-127: whether this fits is the provider router's call, by each
    // provider's real capacity; a fixed limit here refused what Gemini takes.
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
      const generationId = await this.persistGeneration(
        projectId,
        kind,
        result.metadata.runId,
        sources.map((source) => source.id),
        config.candidates?.(result.data) ?? [result.data],
        options.designBaselineId,
      );
      return this.getGeneration(projectId, kind, generationId);
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }

  private async persistGeneration(
    projectId: string,
    kind: StructuredAnalysisKind,
    aiRunId: string,
    sourceIds: string[],
    rawContents: Content[],
    designBaselineId?: string,
  ) {
    const allowed = new Set(
      (
        await this.prisma.artifactVersion.findMany({
          where: { id: { in: sourceIds }, projectId },
          select: { artifact: { select: { code: true } } },
        })
      ).map((version) => version.artifact.code),
    );
    const contents = rawContents.map((content) => cleanSourceCodes(content, allowed));
    return this.prisma.$transaction(async (tx) => {
      const generation = await tx.structuredAnalysisGeneration.create({
        data: { projectId, kind, aiRunId },
      });
      await tx.structuredAnalysisGenerationSource.createMany({
        data: sourceIds.map((id) => ({
          generationId: generation.id,
          artifactVersionId: id,
          sourceId: id,
        })),
      });
      await tx.structuredAnalysisCandidate.createMany({
        data: contents.map((content, index) => ({
          generationId: generation.id,
          candidateId: `candidate-${index + 1}`,
          title:
            contents.length > 1
              ? `${KIND_LABELS[kind]} (candidato ${index + 1})`
              : `${KIND_LABELS[kind]} (candidato)`,
          content: (designBaselineId
            ? { ...withUseCaseProvenance(kind, content), designBaselineId }
            : withUseCaseProvenance(kind, content)) as Prisma.InputJsonValue,
        })),
      });
      return generation.id;
    });
  }

  // DEC-142: the exact approved sources of a batched generation. A class
  // diagram is built from one approved data model; the requirements and use
  // cases chosen go in as a compact view of the analysis.
  private async loadBatchedSources(
    projectId: string,
    kind: StructuredAnalysisKind,
    sourceVersionIds: string[],
  ) {
    const unique = [...new Set(sourceVersionIds)];
    if (unique.length !== sourceVersionIds.length)
      throw new UnprocessableEntityException('Las versiones fuente no pueden repetirse.');
    const sources = await this.prisma.artifactVersion.findMany({
      where: {
        id: { in: unique },
        projectId,
        status: { in: await sourceStatuses(this.prisma, projectId) },
        artifact: { artifactTypeCode: { in: ELIGIBLE_SOURCE_TYPES[kind] } },
      },
      include: {
        artifact: true,
        requirementDetail: { select: { name: true, requirementType: true } },
        useCaseDetail: { select: { name: true, objective: true, primaryActor: true } },
        dataModelDetail: {
          include: {
            entities: {
              orderBy: { position: 'asc' },
              include: { attributes: { orderBy: { position: 'asc' } } },
            },
            relationships: { orderBy: { position: 'asc' } },
          },
        },
      },
      orderBy: { artifact: { code: 'asc' } },
    });
    if (sources.length !== unique.length)
      throw new UnprocessableEntityException(
        'La generación requiere versiones exactas APPROVED de un tipo elegible del mismo proyecto.',
      );
    const models = sources.filter((source) => source.dataModelDetail);
    if (models.length !== 1)
      throw new UnprocessableEntityException(
        'Seleccione exactamente un modelo de datos aprobado como base del diagrama de clases.',
      );
    return { sources, model: models[0]!.dataModelDetail! };
  }

  async checkBatchedSources(
    projectId: string,
    kind: StructuredAnalysisKind,
    sourceVersionIds: string[],
    designBaselineId?: string,
  ) {
    if (['GENERATION_PLAN', 'CONCEPTUAL_DOMAIN_MODEL', 'IMPLEMENTATION_PLAN'].includes(kind))
      await this.currency?.assertCurrent(projectId);
    if (kind === 'UI_BLUEPRINT') await this.loadUiSources(projectId, sourceVersionIds);
    else if (kind === 'CONCEPTUAL_DOMAIN_MODEL')
      await this.loadConceptualSources(projectId, sourceVersionIds);
    else if (kind === 'GENERATION_PLAN') await this.loadPlanSources(projectId, sourceVersionIds);
    else if (kind === 'IMPLEMENTATION_PLAN')
      await this.loadImplementationSources(projectId, sourceVersionIds, designBaselineId);
    else await this.loadBatchedSources(projectId, kind, sourceVersionIds);
  }

  async generateInBatches(
    projectId: string,
    kind: StructuredAnalysisKind,
    sourceVersionIds: string[],
    progress?: StructuredGenerationProgress,
    designBaselineId?: string,
  ) {
    if (kind === 'IMPLEMENTATION_PLAN')
      return this.generateImplementationInBatches(
        projectId,
        kind,
        sourceVersionIds,
        progress,
        designBaselineId,
      );
    if (kind === 'CLASS_DIAGRAM')
      return this.generateClassDiagramInBatches(projectId, kind, sourceVersionIds, progress);
    if (kind === 'UI_BLUEPRINT')
      return this.generateUiBlueprintInBatches(projectId, kind, sourceVersionIds, progress);
    if (kind === 'CONCEPTUAL_DOMAIN_MODEL')
      return this.generateConceptualInBatches(projectId, kind, sourceVersionIds, progress);
    if (kind === 'GENERATION_PLAN')
      return this.generatePlanInBatches(projectId, kind, sourceVersionIds, progress);
    throw new UnprocessableEntityException('Este tipo de artefacto no se genera por lotes.');
  }

  // DEC-142: a class diagram of a large data model in one response is too long
  // to arrive whole, so it is drawn a few entities at a time. Each batch sees
  // what the earlier ones drew; each validated result is checkpointed, so a
  // failed run resumes where it stopped. Nothing is published until the end.
  private async generateClassDiagramInBatches(
    projectId: string,
    kind: StructuredAnalysisKind,
    sourceVersionIds: string[],
    progress?: StructuredGenerationProgress,
  ) {
    const { sources, model } = await this.loadBatchedSources(projectId, kind, sourceVersionIds);
    const entityName = new Map(model.entities.map((entity) => [entity.id, entity.name]));
    const entities: ModelEntity[] = model.entities.map((entity) => ({
      name: entity.name,
      description: entity.description,
      attributes: entity.attributes.map(({ name, type, required }) => ({ name, type, required })),
    }));
    const relationships: ModelRelationship[] = model.relationships.map((relationship) => ({
      from: entityName.get(relationship.sourceEntityId)!,
      to: entityName.get(relationship.targetEntityId)!,
      name: relationship.name,
      fromCardinality: relationship.sourceCardinality,
      toCardinality: relationship.targetCardinality,
    }));
    // The analysis, compact: enough to know what the system does.
    const analysis = {
      requirements: sources
        .filter((source) => source.requirementDetail)
        .map((source) => ({
          code: source.artifact.code,
          name: source.requirementDetail!.name,
          type: source.requirementDetail!.requirementType,
        })),
      useCases: sources
        .filter((source) => source.useCaseDetail)
        .map((source) => ({
          code: source.artifact.code,
          name: source.useCaseDetail!.name,
          objective: source.useCaseDetail!.objective,
          primaryActor: source.useCaseDetail!.primaryActor,
        })),
    };
    const plan = planClassBatches(entities);
    const language = await getProjectLanguage(this.prisma, projectId);
    let drawn: ClassDrawn = { classes: [], relationships: [] };
    let lastRunId = '';
    try {
      const knownEntities = new Set(
        entities.map((entity) => entity.name.trim().toLocaleLowerCase('es')),
      );
      const dataModelCode = sources.find((source) => source.dataModelDetail)!.artifact.code;
      for (const [position, batch] of plan.entries()) {
        progress?.update(position, plan.length, 0);
        const targets = entities.filter((entity) => batch.includes(entity.name));
        // The model sometimes answers with only part of a batch: what it left
        // out is asked for again (twice at most) before it is filled in from the
        // data model. Each answer is a checkpoint of its own.
        let remaining = targets;
        for (let attempt = 0; attempt < CLASS_BATCH_ATTEMPTS && remaining.length; attempt += 1) {
          const part = position * CLASS_BATCH_ATTEMPTS + attempt;
          const cached = progress
            ? await this.prisma.structuredGenerationPart.findUnique({
                where: { jobId_position: { jobId: progress.jobId, position: part } },
              })
            : null;
          let output: z.infer<typeof classBatchOutputSchema>;
          if (cached) {
            output = classBatchOutputSchema.parse(cached.content);
            lastRunId = cached.aiRunId;
          } else {
            const result = await this.ai.generateStructured({
              projectId,
              language,
              promptKey: 'class-diagram.generate',
              promptVersion: 4,
              messages: [
                {
                  role: 'user',
                  content: JSON.stringify({
                    dataModelCode,
                    targetEntities: remaining,
                    dataModelRelationships: relationshipsToDraw(entities, relationships, batch),
                    existingClasses: drawn.classes.map((cls) => ({
                      localId: cls.localId,
                      name: cls.name,
                      stereotype: cls.stereotype,
                      entityName: cls.dataModelEntityName,
                    })),
                    analysis,
                  }),
                },
              ],
              outputSchema: classBatchOutputSchema,
              schemaName: 'class_diagram_batch',
              maxOutputTokens: 12_288,
            });
            output = result.data;
            lastRunId = result.metadata.runId;
          }
          // Domain validation happens here, before anything is checkpointed.
          drawn = mergeClassBatch(drawn, output, remaining, { knownEntities, dataModelCode });
          if (progress && !cached)
            await this.prisma.structuredGenerationPart.upsert({
              where: { jobId_position: { jobId: progress.jobId, position: part } },
              create: {
                jobId: progress.jobId,
                position: part,
                aiRunId: lastRunId,
                content: output,
              },
              update: { aiRunId: lastRunId, content: output },
            });
          remaining = entitiesWithoutClass(drawn, remaining);
        }
        drawn = fillMissingEntities(drawn, remaining, dataModelCode);
        progress?.update(position + 1, plan.length, 0);
      }
      const content = finishClassDiagram(completeRelationships(drawn, relationships));
      const id = await this.persistGeneration(
        projectId,
        kind,
        lastRunId,
        sources.map((source) => source.id),
        [content as unknown as Content],
      );
      return this.getGeneration(projectId, kind, id);
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }

  // DEC-143: the approved sources of a UI blueprint drawn in batches. It is
  // drawn view by view of one approved navigation tree; the use cases, data
  // model and architectures chosen go in as what each screen is made of.
  private async loadUiSources(projectId: string, sourceVersionIds: string[]) {
    const unique = [...new Set(sourceVersionIds)];
    if (unique.length !== sourceVersionIds.length)
      throw new UnprocessableEntityException('Las versiones fuente no pueden repetirse.');
    const sources = await this.prisma.artifactVersion.findMany({
      where: {
        id: { in: unique },
        projectId,
        status: { in: await sourceStatuses(this.prisma, projectId) },
        artifact: { artifactTypeCode: { in: ELIGIBLE_SOURCE_TYPES.UI_BLUEPRINT } },
      },
      include: {
        artifact: true,
        structuredAnalysisDetail: true,
        useCaseDetail: {
          include: {
            secondaryActors: { orderBy: { position: 'asc' } },
            postconditions: { orderBy: { position: 'asc' } },
            mainFlowSteps: { orderBy: { position: 'asc' } },
          },
        },
        dataModelDetail: {
          include: {
            entities: {
              orderBy: { position: 'asc' },
              include: { attributes: { orderBy: { position: 'asc' } } },
            },
          },
        },
      },
      orderBy: { artifact: { code: 'asc' } },
    });
    if (sources.length !== unique.length)
      throw new UnprocessableEntityException(
        'La generación requiere versiones exactas APPROVED de un tipo elegible del mismo proyecto.',
      );
    const trees = sources.filter(
      (source) => source.artifact.artifactTypeCode === 'NAVIGATION_TREE',
    );
    if (trees.length !== 1)
      throw new UnprocessableEntityException(
        'Seleccione exactamente un árbol de navegación aprobado como base del plano de interfaz.',
      );
    const tree = navigationTreeContentSchema.safeParse(trees[0]!.structuredAnalysisDetail?.content);
    if (!tree.success)
      throw new UnprocessableEntityException('El árbol de navegación seleccionado no es válido.');
    return { sources, nodes: tree.data.nodes };
  }

  private async generateUiBlueprintInBatches(
    projectId: string,
    kind: StructuredAnalysisKind,
    sourceVersionIds: string[],
    progress?: StructuredGenerationProgress,
  ) {
    const { sources, nodes } = await this.loadUiSources(projectId, sourceVersionIds);
    const useCases = new Map(
      sources
        .filter((source) => source.useCaseDetail)
        .map((source) => {
          const detail = source.useCaseDetail!;
          return [
            source.artifact.code,
            {
              code: source.artifact.code,
              name: detail.name,
              objective: detail.objective,
              primaryActor: detail.primaryActor,
              secondaryActors: detail.secondaryActors.map((actor) => actor.name),
              postconditions: detail.postconditions.map((item) => item.description),
              mainFlow: detail.mainFlowSteps.map((step) => step.action),
            },
          ] as const;
        }),
    );
    const dataModel = sources
      .filter((source) => source.dataModelDetail)
      .flatMap((source) =>
        source.dataModelDetail!.entities.map((entity) => ({
          name: entity.name,
          attributes: entity.attributes.map((attribute) => attribute.name),
        })),
      );
    const architecture = sources
      .filter((source) =>
        ['SOFTWARE_ARCHITECTURE', 'SYSTEM_ARCHITECTURE'].includes(source.artifact.artifactTypeCode),
      )
      .map((source) => {
        const content = source.structuredAnalysisDetail?.content as
          { components?: { name: string }[]; nodes?: { name: string }[] } | undefined;
        return {
          code: source.artifact.code,
          elements: (content?.components ?? content?.nodes ?? []).map((element) => element.name),
        };
      });
    const options = {
      knownNodeIds: new Set<string>(),
      useCaseCodes: new Set(useCases.keys()),
      sourceCodes: new Set(sources.map((source) => source.artifact.code)),
    };
    const plan = planUiBatches(nodes);
    if (!plan.length)
      throw new UnprocessableEntityException(
        'El árbol de navegación no tiene vistas para las que dibujar pantallas.',
      );
    const language = await getProjectLanguage(this.prisma, projectId);
    let screens: Screen[] = [];
    let lastRunId = '';
    try {
      for (const [position, batch] of plan.entries()) {
        progress?.update(position, plan.length, 0);
        // The model sometimes answers with only part of a batch: the views it
        // left out are asked for again (twice at most) before a plain screen is
        // made from the navigation tree. Each answer is a checkpoint of its own.
        let remaining = batch;
        for (let attempt = 0; attempt < UI_BATCH_ATTEMPTS && remaining.length; attempt += 1) {
          const part = position * UI_BATCH_ATTEMPTS + attempt;
          const cached = progress
            ? await this.prisma.structuredGenerationPart.findUnique({
                where: { jobId_position: { jobId: progress.jobId, position: part } },
              })
            : null;
          let output: z.infer<typeof uiBlueprintBatchOutputSchema>;
          if (cached) {
            output = uiBlueprintBatchOutputSchema.parse(cached.content);
            lastRunId = cached.aiRunId;
          } else {
            const codes = [...new Set(remaining.flatMap((node) => node.relatedUseCaseCodes))];
            const result = await this.ai.generateStructured({
              projectId,
              language,
              promptKey: 'ui-blueprint.generate',
              promptVersion: 3,
              messages: [
                {
                  role: 'user',
                  content: JSON.stringify({
                    targetNodes: remaining,
                    useCases: codes.flatMap((code) => useCases.get(code) ?? []),
                    dataModel,
                    architecture,
                    existingScreens: screens.map((screen) => ({
                      localId: screen.localId,
                      name: screen.name,
                      navigationNodeLocalId: screen.navigationNodeLocalId,
                    })),
                  }),
                },
              ],
              outputSchema: uiBlueprintBatchOutputSchema,
              schemaName: 'ui_blueprint_batch',
              maxOutputTokens: 12_288,
            });
            output = result.data;
            lastRunId = result.metadata.runId;
          }
          // Domain validation happens here, before anything is checkpointed.
          screens = mergeUiBatch(screens, output, remaining, options);
          if (progress && !cached)
            await this.prisma.structuredGenerationPart.upsert({
              where: { jobId_position: { jobId: progress.jobId, position: part } },
              create: {
                jobId: progress.jobId,
                position: part,
                aiRunId: lastRunId,
                content: output,
              },
              update: { aiRunId: lastRunId, content: output },
            });
          remaining = nodesWithoutScreen(screens, remaining);
        }
        screens = fillMissingScreens(screens, remaining);
        batch.forEach((node) => options.knownNodeIds.add(node.localId));
        progress?.update(position + 1, plan.length, 0);
      }
      const content = finishUiBlueprint(screens);
      const id = await this.persistGeneration(
        projectId,
        kind,
        lastRunId,
        sources.map((source) => source.id),
        [content as unknown as Content],
      );
      return this.getGeneration(projectId, kind, id);
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }

  // DEC-144: the conceptual model is drawn class by class of one approved class
  // diagram (DEC-121): each persisted class gets its entity. The plan, when
  // chosen, gives the modules; the analysis chosen goes in as a compact view.
  private async loadConceptualSources(projectId: string, sourceVersionIds: string[]) {
    const unique = [...new Set(sourceVersionIds)];
    if (unique.length !== sourceVersionIds.length)
      throw new UnprocessableEntityException('Las versiones fuente no pueden repetirse.');
    const sources = await this.prisma.artifactVersion.findMany({
      where: {
        id: { in: unique },
        projectId,
        status: { in: await sourceStatuses(this.prisma, projectId) },
        artifact: { artifactTypeCode: { in: ELIGIBLE_SOURCE_TYPES.CONCEPTUAL_DOMAIN_MODEL } },
      },
      include: {
        artifact: true,
        structuredAnalysisDetail: true,
        requirementDetail: { select: { name: true, requirementType: true } },
        useCaseDetail: { select: { name: true, objective: true, primaryActor: true } },
      },
      orderBy: { artifact: { code: 'asc' } },
    });
    if (sources.length !== unique.length)
      throw new UnprocessableEntityException(
        'La generación requiere versiones exactas APPROVED de un tipo elegible del mismo proyecto.',
      );
    const diagrams = sources.filter(
      (source) => source.artifact.artifactTypeCode === 'CLASS_DIAGRAM',
    );
    if (diagrams.length !== 1)
      throw new UnprocessableEntityException(
        'Seleccione exactamente un diagrama de clases aprobado como base del modelo conceptual.',
      );
    const diagram = classDiagramContentSchema.safeParse(
      diagrams[0]!.structuredAnalysisDetail?.content,
    );
    if (!diagram.success)
      throw new UnprocessableEntityException('El diagrama de clases seleccionado no es válido.');
    if (!diagram.data.classes.some((cls) => cls.stereotype === 'ENTITY'))
      throw new UnprocessableEntityException(
        'El diagrama de clases no tiene clases de entidad para llevar al modelo.',
      );
    const plans = sources.filter(
      (source) => source.artifact.artifactTypeCode === 'GENERATION_PLAN',
    );
    const plan = plans.length
      ? generationPlanContentSchema.safeParse(plans[0]!.structuredAnalysisDetail?.content)
      : null;
    return {
      sources,
      classes: diagram.data.classes,
      classRelationships: diagram.data.relationships,
      planModules: plan?.success
        ? plan.data.modules.map((module) => ({
            name: module.name,
            purpose: module.purpose,
            entityNames: module.entityNames,
          }))
        : [],
    };
  }

  private async generateConceptualInBatches(
    projectId: string,
    kind: StructuredAnalysisKind,
    sourceVersionIds: string[],
    progress?: StructuredGenerationProgress,
  ) {
    const { sources, classes, classRelationships, planModules } = await this.loadConceptualSources(
      projectId,
      sourceVersionIds,
    );
    const analysis = {
      requirements: sources
        .filter((source) => source.requirementDetail)
        .map((source) => ({
          code: source.artifact.code,
          name: source.requirementDetail!.name,
          type: source.requirementDetail!.requirementType,
        })),
      useCases: sources
        .filter((source) => source.useCaseDetail)
        .map((source) => ({
          code: source.artifact.code,
          name: source.useCaseDetail!.name,
          objective: source.useCaseDetail!.objective,
        })),
    };
    const plan = planConceptualBatches(classes);
    const runner = createStepRunner({
      prisma: this.prisma,
      ai: this.ai,
      projectId,
      language: await getProjectLanguage(this.prisma, projectId),
      progress,
    });
    let drawn: ConceptualDrawn = { entities: [], relationships: [] };
    try {
      for (const [position, batch] of plan.entries()) {
        progress?.update(position, plan.length, 0);
        // What the model leaves out of a batch is asked for again (twice at
        // most) before the entity is made from the class itself.
        let remaining = batch;
        for (
          let attempt = 0;
          attempt < CONCEPTUAL_BATCH_ATTEMPTS && remaining.length;
          attempt += 1
        ) {
          await runner.run(
            position * CONCEPTUAL_BATCH_ATTEMPTS + attempt,
            {
              promptKey: 'conceptual-domain-model.generate',
              promptVersion: 3,
              payload: {
                targetClasses: remaining.map((cls) => ({
                  localId: cls.localId,
                  name: cls.name,
                  description: cls.description,
                  attributes: cls.attributes.map(({ name, type, required }) => ({
                    name,
                    type,
                    required,
                  })),
                  relatedSourceCodes: cls.relatedSourceCodes,
                })),
                classRelationships: relationshipsToCarry(classes, classRelationships, batch),
                existingEntities: drawn.entities.map((entity) => ({
                  localId: entity.localId,
                  name: entity.name,
                  classLocalId: entity.classLocalId,
                })),
                plan: planModules,
                analysis,
              },
              schema: conceptualBatchOutputSchema,
              schemaName: 'conceptual_model_batch',
              maxOutputTokens: 12_288,
            },
            (output) => {
              drawn = mergeConceptualBatch(drawn, output, remaining);
            },
          );
          remaining = classesWithoutEntity(drawn, remaining);
        }
        drawn = fillMissingConceptualEntities(drawn, remaining);
        progress?.update(position + 1, plan.length, 0);
      }
      const content = finishConceptualModel(
        completeConceptualRelationships(drawn, classRelationships),
      );
      const id = await this.persistGeneration(
        projectId,
        kind,
        runner.lastRunId,
        sources.map((source) => source.id),
        [content as unknown as Content],
      );
      return this.getGeneration(projectId, kind, id);
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }

  // DEC-144: the generation plan is drawn in two stages. The outline (modules,
  // actors, integrations, authentication, constraints, risks) comes first from
  // a compact view of the whole analysis and design; then each batch of
  // modules gets its workflows and screens.
  private async loadPlanSources(projectId: string, sourceVersionIds: string[]) {
    const unique = [...new Set(sourceVersionIds)];
    if (unique.length !== sourceVersionIds.length)
      throw new UnprocessableEntityException('Las versiones fuente no pueden repetirse.');
    const sources = await this.prisma.artifactVersion.findMany({
      where: {
        id: { in: unique },
        projectId,
        status: { in: await sourceStatuses(this.prisma, projectId) },
        artifact: { artifactTypeCode: { in: ELIGIBLE_SOURCE_TYPES.GENERATION_PLAN } },
      },
      include: {
        artifact: true,
        structuredAnalysisDetail: true,
        requirementDetail: { select: { name: true, requirementType: true, priority: true } },
        useCaseDetail: {
          include: { mainFlowSteps: { orderBy: { position: 'asc' } } },
        },
        dataModelDetail: { include: { entities: { orderBy: { position: 'asc' } } } },
      },
      orderBy: { artifact: { code: 'asc' } },
    });
    if (sources.length !== unique.length)
      throw new UnprocessableEntityException(
        'La generación requiere versiones exactas APPROVED de un tipo elegible del mismo proyecto.',
      );
    if (!sources.some((source) => source.requirementDetail || source.useCaseDetail))
      throw new UnprocessableEntityException(
        'Seleccione al menos un requisito o caso de uso aprobado como base del plan.',
      );
    return { sources };
  }

  private async generatePlanInBatches(
    projectId: string,
    kind: StructuredAnalysisKind,
    sourceVersionIds: string[],
    progress?: StructuredGenerationProgress,
  ) {
    const { sources } = await this.loadPlanSources(projectId, sourceVersionIds);
    const typeOf = (source: (typeof sources)[number]) => source.artifact.artifactTypeCode;
    const useCases = new Map(
      sources
        .filter((source) => source.useCaseDetail)
        .map((source) => {
          const detail = source.useCaseDetail!;
          return [
            source.artifact.code,
            {
              code: source.artifact.code,
              name: detail.name,
              objective: detail.objective,
              primaryActor: detail.primaryActor,
              mainFlow: detail.mainFlowSteps.slice(0, 8).map((step) => step.action),
            },
          ] as const;
        }),
    );
    const analysis = {
      requirements: sources
        .filter((source) => source.requirementDetail)
        .map((source) => ({
          code: source.artifact.code,
          name: source.requirementDetail!.name,
          type: source.requirementDetail!.requirementType,
          priority: source.requirementDetail!.priority,
        })),
      useCases: [...useCases.values()].map(({ code, name, objective, primaryActor }) => ({
        code,
        name,
        objective,
        primaryActor,
      })),
    };
    const content = (type: string) =>
      sources
        .filter((source) => typeOf(source) === type)
        .map((source) => source.structuredAnalysisDetail?.content);
    const design = {
      dataModelEntities: sources.flatMap(
        (source) => source.dataModelDetail?.entities.map((entity) => entity.name) ?? [],
      ),
      classes: content('CLASS_DIAGRAM').flatMap((value) => {
        const parsed = classDiagramContentSchema.safeParse(value);
        return parsed.success
          ? parsed.data.classes.filter((cls) => cls.stereotype === 'ENTITY').map((cls) => cls.name)
          : [];
      }),
      navigationViews: content('NAVIGATION_TREE').flatMap((value) => {
        const parsed = navigationTreeContentSchema.safeParse(value);
        return parsed.success ? parsed.data.nodes.map((node) => node.label) : [];
      }),
      screens: content('UI_BLUEPRINT').flatMap((value) => {
        const parsed = uiBlueprintContentSchema.safeParse(value);
        return parsed.success ? parsed.data.screens.map((screen) => screen.name) : [];
      }),
    };
    const codes: PlanCodes = {
      requirements: new Set(analysis.requirements.map((item) => item.code)),
      useCases: new Set(useCases.keys()),
      sources: new Set(sources.map((source) => source.artifact.code)),
    };
    const runner = createStepRunner({
      prisma: this.prisma,
      ai: this.ai,
      projectId,
      language: await getProjectLanguage(this.prisma, projectId),
      progress,
    });
    try {
      progress?.update(0, 1, 0);
      let outline!: z.infer<typeof planOutlineSchema>;
      await runner.run(
        0,
        {
          promptKey: 'generation-plan.generate',
          promptVersion: 3,
          payload: { analysis, design },
          schema: planOutlineSchema,
          schemaName: 'generation_plan_outline',
          maxOutputTokens: 16_384,
        },
        (output) => {
          outline = cleanOutline(output, codes);
        },
      );
      const batches = planDetailBatches(outline.modules);
      const allModuleIds = new Set(outline.modules.map((module) => module.localId));
      const total = batches.length + 1;
      progress?.update(1, total, 0);
      let drawn: PlanAccumulated = { workflows: [], screens: [] };
      for (const [position, batch] of batches.entries()) {
        // The modules the model gave no screen are asked for again (twice at
        // most) before a screen is made from the module itself.
        let remaining = batch;
        for (let attempt = 0; attempt < PLAN_BATCH_ATTEMPTS && remaining.length; attempt += 1) {
          await runner.run(
            1 + position * PLAN_BATCH_ATTEMPTS + attempt,
            {
              promptKey: 'generation-plan.detail',
              promptVersion: 1,
              payload: {
                targetModules: remaining.map((module) => ({
                  localId: module.localId,
                  name: module.name,
                  purpose: module.purpose,
                  entityNames: module.entityNames,
                  relatedSourceCodes: module.relatedSourceCodes,
                  useCases: module.relatedUseCaseCodes.flatMap((code) => useCases.get(code) ?? []),
                })),
                otherModules: outline.modules
                  .filter((module) => !batch.includes(module))
                  .map((module) => module.name),
                actors: outline.actors.map((actor) => actor.name),
                existingWorkflows: drawn.workflows.map((workflow) => workflow.name),
              },
              schema: planDetailBatchOutputSchema,
              schemaName: 'generation_plan_detail',
              maxOutputTokens: 12_288,
            },
            (output) => {
              drawn = mergePlanBatch(drawn, output, remaining, codes, allModuleIds);
            },
          );
          remaining = modulesWithoutScreen(drawn, remaining);
        }
        drawn = fillMissingPlanScreens(drawn, remaining);
        progress?.update(position + 2, total, 0);
      }
      const plan = finishGenerationPlan(outline, drawn);
      const id = await this.persistGeneration(
        projectId,
        kind,
        runner.lastRunId,
        sources.map((source) => source.id),
        [plan as unknown as Content],
      );
      return this.getGeneration(projectId, kind, id);
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }

  // DEC-144: the implementation plan is drawn from what an approved Design
  // Baseline froze, in stages: the skeleton (roles, modules, variables), then
  // the entities of a few classes at a time (relations follow from the class
  // diagram), then the routes of a few screens at a time with the custom
  // endpoints they need. Tests are derived from modules and routes.
  private async loadImplementationSources(
    projectId: string,
    sourceVersionIds: string[],
    designBaselineId: string | undefined,
  ) {
    if (!designBaselineId)
      throw new UnprocessableEntityException(
        'Seleccione la línea base de diseño aprobada de la que parte el plan.',
      );
    const unique = [...new Set(sourceVersionIds)];
    const frozen = new Set(await this.designBaselineVersionIds(projectId, designBaselineId));
    if (unique.length !== sourceVersionIds.length || unique.some((id) => !frozen.has(id)))
      throw new UnprocessableEntityException(
        'Las fuentes deben ser versiones congeladas en la línea base de diseño seleccionada.',
      );
    const sources = await this.prisma.artifactVersion.findMany({
      where: {
        id: { in: unique },
        projectId,
        status: { in: await sourceStatuses(this.prisma, projectId) },
        artifact: { artifactTypeCode: { in: ELIGIBLE_SOURCE_TYPES.IMPLEMENTATION_PLAN } },
      },
      include: { artifact: true, structuredAnalysisDetail: true },
      orderBy: { artifact: { code: 'asc' } },
    });
    if (sources.length !== unique.length)
      throw new UnprocessableEntityException(
        'La generación requiere versiones exactas APPROVED de un tipo elegible del mismo proyecto.',
      );
    const contentOf = (type: string) =>
      sources.find((source) => source.artifact.artifactTypeCode === type)?.structuredAnalysisDetail
        ?.content;
    const diagram = classDiagramContentSchema.safeParse(contentOf('CLASS_DIAGRAM'));
    if (!diagram.success || !diagram.data.classes.some((cls) => cls.stereotype === 'ENTITY'))
      throw new UnprocessableEntityException(
        'La línea base debe incluir un diagrama de clases con clases de entidad.',
      );
    const plan = generationPlanContentSchema.safeParse(contentOf('GENERATION_PLAN'));
    if (!plan.success)
      throw new UnprocessableEntityException('La línea base debe incluir un plan de generación.');
    const blueprint = uiBlueprintContentSchema.safeParse(contentOf('UI_BLUEPRINT'));
    const conceptual = conceptualDomainModelContentSchema.safeParse(
      contentOf('CONCEPTUAL_DOMAIN_MODEL'),
    );
    return {
      sources,
      classes: diagram.data.classes,
      classRelationships: diagram.data.relationships,
      plan: plan.data,
      screens: blueprint.success ? blueprint.data.screens : [],
      conceptualEntities: conceptual.success ? conceptual.data.entities : [],
    };
  }

  private async generateImplementationInBatches(
    projectId: string,
    kind: StructuredAnalysisKind,
    sourceVersionIds: string[],
    progress: StructuredGenerationProgress | undefined,
    designBaselineId: string | undefined,
  ) {
    const { sources, classes, classRelationships, plan, screens, conceptualEntities } =
      await this.loadImplementationSources(projectId, sourceVersionIds, designBaselineId);
    const baselineId = designBaselineId!;
    const sourceCodes = new Set(sources.map((source) => source.artifact.code));
    const entityBatches = planEntityBatches(classes);
    const routeBatches = planRouteBatches(screens);
    const total = 1 + entityBatches.length + routeBatches.length;
    const runner = createStepRunner({
      prisma: this.prisma,
      ai: this.ai,
      projectId,
      language: await getProjectLanguage(this.prisma, projectId),
      progress,
    });
    try {
      progress?.update(0, total, 0);
      let skeleton!: z.infer<typeof implementationSkeletonSchema>;
      await runner.run(
        0,
        {
          promptKey: 'implementation-plan.skeleton',
          promptVersion: 1,
          payload: {
            planModules: plan.modules.map((module) => ({
              name: module.name,
              purpose: module.purpose,
              entityNames: module.entityNames,
              relatedSourceCodes: module.relatedSourceCodes,
            })),
            entityClasses: classes
              .filter((cls) => cls.stereotype === 'ENTITY')
              .map((cls) => cls.name),
            screens: screens.map((screen) => screen.name),
            authentication: plan.authentication,
          },
          schema: implementationSkeletonSchema,
          schemaName: 'implementation_plan_skeleton',
          maxOutputTokens: 8192,
        },
        (output) => {
          skeleton = cleanSkeleton(output, sourceCodes);
        },
      );
      const context: PlanContext = {
        moduleIds: new Set(skeleton.modules.map((module) => module.localId)),
        roles: new Set(skeleton.authentication.roles),
        sourceCodes,
      };
      const allClassIds = new Set(classes.map((cls) => cls.localId));
      // The module a class belongs to, by the plan module that lists its entity.
      const moduleOf = (cls: (typeof classes)[number]) => {
        const index = plan.modules.findIndex((module) =>
          module.entityNames.some((name) => name.trim().toLowerCase() === cls.name.toLowerCase()),
        );
        return skeleton.modules.length === plan.modules.length && index >= 0
          ? skeleton.modules[index]!.localId
          : undefined;
      };
      progress?.update(1, total, 0);

      let entities: IpEntity[] = [];
      for (const [position, batch] of entityBatches.entries()) {
        let remaining = batch;
        for (let attempt = 0; attempt < IP_BATCH_ATTEMPTS && remaining.length; attempt += 1) {
          await runner.run(
            1 + position * IP_BATCH_ATTEMPTS + attempt,
            {
              promptKey: 'implementation-plan.entities',
              promptVersion: 1,
              payload: {
                targetClasses: remaining.map((cls) => ({
                  localId: cls.localId,
                  name: cls.name,
                  description: cls.description,
                  attributes: cls.attributes.map(({ name, type, required }) => ({
                    name,
                    type,
                    required,
                  })),
                  relatedSourceCodes: cls.relatedSourceCodes,
                })),
                enumerations: classes
                  .filter((cls) => cls.stereotype === 'ENUMERATION')
                  .map((cls) => ({
                    name: cls.name,
                    values: cls.attributes.map((attribute) => attribute.name),
                  })),
                conceptualEntities: conceptualEntities
                  .filter((entity) => remaining.some((cls) => cls.localId === entity.classLocalId))
                  .map((entity) => ({
                    classLocalId: entity.classLocalId,
                    moduleName: entity.moduleName,
                    description: entity.description,
                  })),
                modules: skeleton.modules.map((module) => ({
                  localId: module.localId,
                  name: module.name,
                  description: module.description,
                })),
                roles: skeleton.authentication.roles,
                existingEntities: entities.map((entity) => entity.name),
              },
              schema: implementationEntityBatchOutputSchema,
              schemaName: 'implementation_plan_entities',
              maxOutputTokens: 12_288,
            },
            (output) => {
              entities = mergeEntityBatch(entities, output, remaining, context, allClassIds);
            },
          );
          remaining = classesWithoutPlanEntity(entities, remaining);
        }
        entities = fillMissingPlanEntities(entities, remaining, classes, context, moduleOf);
        progress?.update(2 + position, total, 0);
      }
      entities = addRelations(entities, classRelationships);

      let routes: RoutesAccumulated = { routes: [], customEndpoints: [] };
      const allScreenIds = new Set(screens.map((screen) => screen.localId));
      const routeBase = 1 + entityBatches.length * IP_BATCH_ATTEMPTS;
      for (const [position, batch] of routeBatches.entries()) {
        let remaining = batch;
        for (let attempt = 0; attempt < IP_BATCH_ATTEMPTS && remaining.length; attempt += 1) {
          await runner.run(
            routeBase + position * IP_BATCH_ATTEMPTS + attempt,
            {
              promptKey: 'implementation-plan.routes',
              promptVersion: 1,
              payload: {
                targetScreens: remaining.map((screen) => ({
                  localId: screen.localId,
                  name: screen.name,
                  purpose: screen.purpose,
                  primaryActions: screen.primaryActions,
                  secondaryActions: screen.secondaryActions,
                  relatedSourceCodes: screen.relatedSourceCodes,
                })),
                entities: entities.map((entity) => ({
                  localId: entity.localId,
                  name: entity.name,
                  moduleLocalId: entity.moduleLocalId,
                  operations: entity.operations,
                })),
                modules: skeleton.modules.map((module) => ({
                  localId: module.localId,
                  name: module.name,
                })),
                roles: skeleton.authentication.roles,
                existingEndpoints: routes.customEndpoints.map(
                  (endpoint) => `${endpoint.method} ${endpoint.path}`,
                ),
              },
              schema: implementationRoutesBatchOutputSchema,
              schemaName: 'implementation_plan_routes',
              maxOutputTokens: 12_288,
            },
            (output) => {
              routes = mergeRouteBatch(routes, output, remaining, entities, context, allScreenIds);
            },
          );
          remaining = screensWithoutRoute(routes, remaining);
        }
        routes = fillMissingRoutes(routes, remaining, context);
        progress?.update(2 + entityBatches.length + position, total, 0);
      }
      routes = finishRoutes(routes, screens, entities);

      const content = finishImplementationPlan(skeleton, entities, routes, baselineId);
      const id = await this.persistGeneration(
        projectId,
        kind,
        runner.lastRunId,
        sources.map((source) => source.id),
        [content as unknown as Content],
        baselineId,
      );
      return this.getGeneration(projectId, kind, id);
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
        requirementDetail: { select: { requirementType: true } },
      },
    });
    const references: GenerationSourceReference[] = sourceVersions.map((source) => ({
      code: source.artifact.code,
      type: source.artifact.artifactTypeCode,
      requirementType: source.requirementDetail?.requirementType,
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
    if (['GENERATION_PLAN', 'CONCEPTUAL_DOMAIN_MODEL', 'IMPLEMENTATION_PLAN'].includes(kind))
      await this.currency?.assertCurrent(projectId);
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
  async designBaselineSources(
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
    return frozen.map((version) => version.id);
  }

  async generateFromDesignBaseline(
    projectId: string,
    kind: StructuredAnalysisKind,
    designBaselineId: string,
  ) {
    return this.generate(
      projectId,
      kind,
      await this.designBaselineSources(projectId, kind, designBaselineId),
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
