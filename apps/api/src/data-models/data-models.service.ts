import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import { formatArtifactCode } from '@caseflow-ai/domain';
import {
  DATA_MODEL_MAX_OUTPUT_TOKENS,
  dataModelGenerationOutputSchema,
  type DataModelInput,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { DiagramEngine } from './diagram-engine';

type Tx = Prisma.TransactionClient;
const detailInclude = {
  entities: {
    orderBy: { position: 'asc' as const },
    include: { attributes: { orderBy: { position: 'asc' as const } } },
  },
  relationships: {
    orderBy: { position: 'asc' as const },
    include: { sourceEntity: true, targetEntity: true },
  },
};

@Injectable()
export class DataModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
    private readonly diagrams: DiagramEngine,
  ) {}

  create(projectId: string, input: DataModelInput) {
    return this.prisma.$transaction((tx) => this.createInTx(tx, projectId, input, 'MANUAL'));
  }
  async list(projectId: string) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'DATA_MODEL' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { dataModelDetail: { include: detailInclude } },
        },
      },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map((row) => this.map(row, row.versions[0]!)) };
  }
  async get(projectId: string, id: string) {
    const row = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: 'DATA_MODEL' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { dataModelDetail: { include: detailInclude } },
        },
      },
    });
    if (!row?.versions[0]?.dataModelDetail)
      throw new NotFoundException('Modelo de datos no encontrado.');
    return this.map(row, row.versions[0]);
  }
  async version(projectId: string, id: string, input: DataModelInput) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM artifacts WHERE id=${id}::uuid AND project_id=${projectId}::uuid AND artifact_type_code='DATA_MODEL' FOR NO KEY UPDATE`;
      if (!locked.length) throw new NotFoundException('Modelo de datos no encontrado.');
      const latest = await tx.artifactVersion.findFirstOrThrow({
        where: { artifactId: id },
        orderBy: { versionNumber: 'desc' },
      });
      const version = await tx.artifactVersion.create({
        data: {
          artifactId: id,
          projectId,
          versionNumber: latest.versionNumber + 1,
          title: input.title,
          status: 'DRAFT',
          origin: 'MANUAL',
        },
      });
      await this.insertDetail(tx, version.id, input);
      await this.insertERDiagram(tx, version.id, input);
      return this.loadAndMap(tx, id, version.id);
    });
  }

  async generate(projectId: string, requirementVersionIds: string[], useCaseVersionIds: string[]) {
    const sourceIds = [...requirementVersionIds, ...useCaseVersionIds];
    if (new Set(sourceIds).size !== sourceIds.length)
      throw new UnprocessableEntityException('Las versiones fuente no pueden repetirse.');
    const sources = await this.prisma.artifactVersion.findMany({
      where: {
        id: { in: sourceIds },
        projectId,
        status: 'APPROVED',
        artifact: { artifactTypeCode: { in: ['REQUIREMENT', 'USE_CASE'] } },
      },
      include: {
        artifact: true,
        requirementDetail: true,
        useCaseDetail: {
          include: {
            secondaryActors: { orderBy: { position: 'asc' } },
            mainFlowSteps: { orderBy: { position: 'asc' } },
          },
        },
      },
    });
    const expected = new Map<string, string>([
      ...requirementVersionIds.map((id): [string, string] => [id, 'REQUIREMENT']),
      ...useCaseVersionIds.map((id): [string, string] => [id, 'USE_CASE']),
    ]);
    if (
      sources.length !== sourceIds.length ||
      sources.some((source) => source.artifact.artifactTypeCode !== expected.get(source.id))
    )
      throw new UnprocessableEntityException(
        'La generación requiere versiones exactas APPROVED del tipo y proyecto indicados.',
      );
    try {
      const result = await this.ai.generateStructured({
        projectId,
        promptKey: 'data-model.generate',
        promptVersion: 1,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              sources: sources.map((source) => ({
                sourceId: source.id,
                type: source.artifact.artifactTypeCode,
                code: source.artifact.code,
                requirement: source.requirementDetail,
                useCase: source.useCaseDetail,
              })),
            }),
          },
        ],
        outputSchema: dataModelGenerationOutputSchema,
        schemaName: 'data_model_generation',
        maxOutputTokens: DATA_MODEL_MAX_OUTPUT_TOKENS,
      });
      const generationId = await this.prisma.$transaction(async (tx) => {
        const generation = await tx.dataModelGeneration.create({
          data: { projectId, aiRunId: result.metadata.runId },
        });
        await tx.dataModelGenerationSource.createMany({
          data: sources.map((source) => ({
            generationId: generation.id,
            artifactVersionId: source.id,
            sourceId: source.id,
          })),
        });
        for (const candidate of result.data.candidates)
          await tx.dataModelCandidate.create({
            data: {
              generationId: generation.id,
              candidateId: candidate.candidateId,
              title: candidate.title,
              modelKind: candidate.modelKind,
              entities: candidate.entities,
              relationships: candidate.relationships,
            },
          });
        return generation.id;
      });
      return this.getGeneration(projectId, generationId);
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }
  async getGeneration(projectId: string, id: string) {
    const generation = await this.prisma.dataModelGeneration.findFirst({
      where: { id, projectId },
      include: { sources: true, candidates: { orderBy: { candidateId: 'asc' } } },
    });
    if (!generation) throw new NotFoundException('Generación no encontrada.');
    return generation;
  }
  async accept(projectId: string, generationId: string, candidateIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const generation = await tx.dataModelGeneration.findFirst({
        where: { id: generationId, projectId },
        include: { candidates: true },
      });
      if (!generation) throw new NotFoundException('Generación no encontrada.');
      const selected = new Set(candidateIds);
      const candidates = generation.candidates.filter((candidate) => selected.has(candidate.id));
      if (candidates.length !== selected.size)
        throw new NotFoundException('Candidato no encontrado.');
      const items = [];
      for (const candidate of candidates) {
        if (candidate.acceptedArtifactId)
          throw new UnprocessableEntityException('El candidato ya fue aceptado.');
        const parsed = dataModelGenerationOutputSchema.shape.candidates.element.safeParse({
          candidateId: candidate.candidateId,
          title: candidate.title,
          modelKind: candidate.modelKind,
          entities: candidate.entities,
          relationships: candidate.relationships,
        });
        if (!parsed.success)
          throw new UnprocessableEntityException('El candidato persistido no es válido.');
        const created = await this.createInTx(
          tx,
          projectId,
          parsed.data,
          'AI_GENERATED',
          generation.id,
          candidate.id,
          generation.aiRunId,
        );
        await tx.dataModelCandidate.update({
          where: { id: candidate.id },
          data: { acceptedArtifactId: created.id },
        });
        items.push(created);
      }
      return { items };
    });
  }

  async getERDiagram(projectId: string, dataModelId: string) {
    const row = await this.prisma.artifact.findFirst({
      where: { id: dataModelId, projectId, artifactTypeCode: 'DATA_MODEL' },
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
    if (!row || !version || !diagram) throw new NotFoundException('Diagrama ER no encontrado.');
    return this.mapDiagram(row, version, diagram);
  }
  async generateUseCaseDiagram(projectId: string, sourceVersionIds: string[]) {
    const unique = [...new Set(sourceVersionIds)];
    const sources = await this.prisma.artifactVersion.findMany({
      where: {
        id: { in: unique },
        projectId,
        status: 'APPROVED',
        artifact: { artifactTypeCode: 'USE_CASE' },
      },
      include: {
        artifact: true,
        useCaseDetail: { include: { secondaryActors: { orderBy: { position: 'asc' } } } },
      },
      orderBy: { artifact: { code: 'asc' } },
    });
    if (unique.length !== sourceVersionIds.length || sources.length !== sourceVersionIds.length)
      throw new UnprocessableEntityException(
        'Se requieren versiones exactas APPROVED de casos de uso del mismo proyecto.',
      );
    return this.prisma.$transaction(async (tx) => {
      const number = await this.allocate(tx, projectId, 'DIA');
      const artifact = await tx.artifact.create({
        data: {
          projectId,
          artifactTypeCode: 'USE_CASE_DIAGRAM',
          code: formatArtifactCode('DIA', number),
        },
      });
      const version = await tx.artifactVersion.create({
        data: {
          artifactId: artifact.id,
          projectId,
          versionNumber: 1,
          title: 'Diagrama de casos de uso',
          status: 'GENERATED',
          origin: 'MANUAL',
        },
      });
      const source = this.diagrams.generateUseCase({
        systemName: 'Sistema',
        useCases: sources.map((item) => ({
          code: item.artifact.code,
          name: item.useCaseDetail!.name,
          actors: [
            item.useCaseDetail!.primaryActor,
            ...item.useCaseDetail!.secondaryActors.map((actor) => actor.name),
          ],
        })),
      });
      this.diagrams.validate('PLANTUML', source);
      const svg = this.diagrams.renderSvg('PLANTUML', source);
      const detail = await tx.diagramDetail.create({
        data: {
          artifactVersionId: version.id,
          kind: 'USE_CASE',
          sourceFormat: 'PLANTUML',
          generatorVersion: 'caseflow-svg-v1',
          source,
          svg,
          sources: {
            create: unique.map((sourceArtifactVersionId) => ({ sourceArtifactVersionId })),
          },
        },
        include: { sources: true },
      });
      return this.mapDiagram(artifact, version, detail);
    });
  }
  async getUseCaseDiagram(projectId: string, id: string) {
    const row = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: 'USE_CASE_DIAGRAM' },
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

  private async createInTx(
    tx: Tx,
    projectId: string,
    input: DataModelInput,
    origin: 'MANUAL' | 'AI_GENERATED',
    generationId?: string,
    candidateId?: string,
    aiRunId?: string,
  ) {
    if (!(await tx.project.findUnique({ where: { id: projectId } })))
      throw new NotFoundException('Proyecto no encontrado.');
    const number = await this.allocate(tx, projectId, 'MD');
    const artifact = await tx.artifact.create({
      data: { projectId, artifactTypeCode: 'DATA_MODEL', code: formatArtifactCode('MD', number) },
    });
    const version = await tx.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        projectId,
        versionNumber: 1,
        title: input.title,
        status: origin === 'MANUAL' ? 'DRAFT' : 'GENERATED',
        origin,
      },
    });
    await this.insertDetail(tx, version.id, input, generationId, candidateId, aiRunId);
    await this.insertERDiagram(tx, version.id, input);
    return this.loadAndMap(tx, artifact.id, version.id);
  }
  private async insertDetail(
    tx: Tx,
    versionId: string,
    input: DataModelInput,
    generationId?: string,
    candidateId?: string,
    aiRunId?: string,
  ) {
    await tx.dataModelDetail.create({
      data: {
        artifactVersionId: versionId,
        modelKind: input.modelKind,
        generationId,
        generationCandidateId: candidateId,
        aiRunId,
      },
    });
    const ids = new Map<string, string>();
    for (const [position, entity] of input.entities.entries()) {
      const row = await tx.dataModelEntity.create({
        data: {
          artifactVersionId: versionId,
          localId: entity.localId,
          position,
          name: entity.name,
          description: entity.description,
          attributes: {
            create: entity.attributes.map((attribute, attributePosition) => ({
              ...attribute,
              position: attributePosition,
            })),
          },
        },
      });
      ids.set(entity.localId, row.id);
    }
    await tx.dataModelRelationship.createMany({
      data: input.relationships.map((relationship, position) => ({
        artifactVersionId: versionId,
        position,
        sourceEntityId: ids.get(relationship.sourceEntityId)!,
        targetEntityId: ids.get(relationship.targetEntityId)!,
        name: relationship.name,
        sourceCardinality: relationship.sourceCardinality,
        targetCardinality: relationship.targetCardinality,
        description: relationship.description,
      })),
    });
  }
  private async insertERDiagram(tx: Tx, versionId: string, input: DataModelInput) {
    const source = this.diagrams.generateER(input);
    this.diagrams.validate('MERMAID_ER', source);
    const svg = this.diagrams.renderSvg('MERMAID_ER', source);
    await tx.diagramDetail.create({
      data: {
        artifactVersionId: versionId,
        kind: 'ER',
        sourceFormat: 'MERMAID_ER',
        generatorVersion: 'caseflow-svg-v1',
        source,
        svg,
        sources: { create: { sourceArtifactVersionId: versionId } },
      },
    });
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
      include: { dataModelDetail: { include: detailInclude } },
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
      dataModelDetail: unknown;
    },
  ) {
    const detail = version.dataModelDetail as {
      modelKind: 'ER';
      generationId: string | null;
      generationCandidateId: string | null;
      aiRunId: string | null;
      entities: {
        localId: string;
        name: string;
        description: string | null;
        attributes: {
          name: string;
          type: DataModelInput['entities'][number]['attributes'][number]['type'];
          required: boolean;
          primaryKey: boolean;
          unique: boolean;
          description: string | null;
        }[];
      }[];
      relationships: {
        name: string | null;
        sourceCardinality: DataModelInput['relationships'][number]['sourceCardinality'];
        targetCardinality: DataModelInput['relationships'][number]['targetCardinality'];
        description: string | null;
        sourceEntity: { localId: string };
        targetEntity: { localId: string };
      }[];
    };
    return {
      id: artifact.id,
      projectId: artifact.projectId,
      code: artifact.code,
      createdAt: artifact.createdAt.toISOString(),
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        origin: version.origin,
        createdAt: version.createdAt.toISOString(),
      },
      dataModel: {
        title: version.title,
        modelKind: detail.modelKind,
        entities: detail.entities.map((entity) => ({
          localId: entity.localId,
          name: entity.name,
          ...(entity.description ? { description: entity.description } : {}),
          attributes: entity.attributes.map((attribute) => ({
            name: attribute.name,
            type: attribute.type,
            required: attribute.required,
            primaryKey: attribute.primaryKey,
            unique: attribute.unique,
            ...(attribute.description ? { description: attribute.description } : {}),
          })),
        })),
        relationships: detail.relationships.map((relationship) => ({
          sourceEntityId: relationship.sourceEntity.localId,
          targetEntityId: relationship.targetEntity.localId,
          ...(relationship.name ? { name: relationship.name } : {}),
          sourceCardinality: relationship.sourceCardinality,
          targetCardinality: relationship.targetCardinality,
          ...(relationship.description ? { description: relationship.description } : {}),
        })),
        generationId: detail.generationId,
        candidateId: detail.generationCandidateId,
        aiRunId: detail.aiRunId,
      },
    };
  }
  private mapDiagram(
    artifact: { id: string; projectId: string; code: string },
    version: { id: string; versionNumber: number; createdAt: Date },
    detail: {
      kind: 'ER' | 'USE_CASE';
      sourceFormat: 'MERMAID_ER' | 'PLANTUML';
      source: string;
      svg: string;
      sources: { sourceArtifactVersionId: string }[];
    },
  ) {
    return {
      id: artifact.id,
      projectId: artifact.projectId,
      code: artifact.code,
      versionId: version.id,
      versionNumber: version.versionNumber,
      kind: detail.kind,
      sourceFormat: detail.sourceFormat,
      source: detail.source,
      svg: detail.svg,
      sourceArtifactVersionIds: detail.sources.map((source) => source.sourceArtifactVersionId),
      createdAt: version.createdAt.toISOString(),
    };
  }
}
