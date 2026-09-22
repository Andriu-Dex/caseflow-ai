import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import { canTransitionArtifactVersionStatus, formatArtifactCode } from '@caseflow-ai/domain';
import {
  requirementGenerationOutputSchema,
  type RequirementInput,
  type RequirementResponse,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';

type Tx = Prisma.TransactionClient;
const detailInclude = {
  actors: { orderBy: { position: 'asc' as const } },
  preconditions: { orderBy: { position: 'asc' as const } },
  postconditions: { orderBy: { position: 'asc' as const } },
  dependencies: true,
};
@Injectable()
export class RequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
  ) {}
  create(projectId: string, input: RequirementInput) {
    return this.prisma.$transaction((tx) => this.createInTx(tx, projectId, input, 'MANUAL'));
  }
  async list(projectId: string) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'REQUIREMENT' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { requirementDetail: { include: detailInclude } },
        },
      },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map((r) => this.map(r, r.versions[0]!)) };
  }
  async get(projectId: string, id: string) {
    const row = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: 'REQUIREMENT' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { requirementDetail: { include: detailInclude } },
        },
      },
    });
    if (!row || !row.versions[0]) throw new NotFoundException('Requisito no encontrado.');
    return this.map(row, row.versions[0]);
  }
  async version(projectId: string, id: string, input: RequirementInput) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM artifacts WHERE id=${id}::uuid AND project_id=${projectId}::uuid AND artifact_type_code='REQUIREMENT' FOR NO KEY UPDATE`;
      if (!locked.length) throw new NotFoundException('Requisito no encontrado.');
      const latest = await tx.artifactVersion.findFirstOrThrow({
        where: { artifactId: id },
        orderBy: { versionNumber: 'desc' },
      });
      if (latest.status === 'APPROVED')
        throw new UnprocessableEntityException('Un requisito aprobado no puede modificarse.');
      await this.validateDependencies(tx, projectId, id, input.dependencyArtifactIds);
      const v = await tx.artifactVersion.create({
        data: {
          artifactId: id,
          projectId,
          versionNumber: latest.versionNumber + 1,
          title: input.name,
          status: 'DRAFT',
          origin: 'MANUAL',
        },
      });
      await this.insertDetail(tx, v.id, input);
      const artifact = await tx.artifact.findUniqueOrThrow({ where: { id } });
      const complete = await tx.artifactVersion.findUniqueOrThrow({
        where: { id: v.id },
        include: { requirementDetail: { include: detailInclude } },
      });
      return this.map(artifact, complete);
    });
  }
  async generate(projectId: string, sourceContextVersionId: string) {
    const context = await this.prisma.artifactVersion.findFirst({
      where: {
        id: sourceContextVersionId,
        projectId,
        artifact: { artifactTypeCode: 'PROJECT_CONTEXT' },
      },
      include: {
        projectContextDetail: {
          include: {
            actors: { orderBy: { position: 'asc' } },
            needs: { orderBy: { position: 'asc' } },
            constraints: { orderBy: { position: 'asc' } },
            businessRules: { orderBy: { position: 'asc' } },
            scopeItems: { orderBy: { position: 'asc' } },
          },
        },
      },
    });
    if (!context?.projectContextDetail)
      throw new NotFoundException('Versión de contexto no encontrada.');
    try {
      const result = await this.ai.generateStructured({
        projectId,
        sourceArtifactVersionId: sourceContextVersionId,
        promptKey: 'requirements.generate',
        promptVersion: 1,
        messages: [{ role: 'user', content: JSON.stringify(context.projectContextDetail) }],
        outputSchema: requirementGenerationOutputSchema,
        schemaName: 'requirements_generation',
        maxOutputTokens: 4096,
      });
      const generationId = await this.prisma.$transaction(async (tx) => {
        const generation = await tx.requirementGeneration.create({
          data: { projectId, sourceContextVersionId, aiRunId: result.metadata.runId },
        });
        const byKey = new Map<string, string>();
        for (const c of result.data.candidates) {
          const row = await tx.requirementCandidate.create({
            data: {
              generationId: generation.id,
              candidateId: c.candidateId,
              requirementType: c.requirementType,
              name: c.name,
              description: c.description,
              priority: c.priority,
              actors: c.actors,
              preconditions: c.preconditions,
              postconditions: c.postconditions,
            },
          });
          byKey.set(c.candidateId, row.id);
        }
        for (const c of result.data.candidates)
          for (const d of c.dependencyCandidateIds)
            await tx.requirementCandidateDependency.create({
              data: { candidateId: byKey.get(c.candidateId)!, dependsOnCandidateId: byKey.get(d)! },
            });
        return generation.id;
      });
      return this.getGeneration(projectId, generationId);
    } catch (e) {
      if (e instanceof AIError)
        throw new ServiceUnavailableException({ message: e.message, code: e.code });
      throw e;
    }
  }
  async getGeneration(projectId: string, id: string) {
    const row = await this.prisma.requirementGeneration.findFirst({
      where: { id, projectId },
      include: {
        candidates: { include: { outgoingDependencies: true }, orderBy: { candidateId: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException('Generación no encontrada.');
    return row;
  }
  async accept(projectId: string, generationId: string, candidateIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const generation = await tx.requirementGeneration.findFirst({
        where: { id: generationId, projectId },
        include: { candidates: { include: { outgoingDependencies: true } } },
      });
      if (!generation) throw new NotFoundException('Generación no encontrada.');
      const selected = new Set(candidateIds);
      const candidates = generation.candidates.filter((c) => selected.has(c.id));
      if (candidates.length !== selected.size)
        throw new NotFoundException('Candidato no encontrado.');
      for (const c of candidates)
        for (const d of c.outgoingDependencies)
          if (!selected.has(d.dependsOnCandidateId))
            throw new UnprocessableEntityException(
              'Seleccione también todos los candidatos requeridos.',
            );
      const created = new Map<string, RequirementResponse>();
      for (const c of candidates) {
        if (c.acceptedArtifactId)
          throw new UnprocessableEntityException('El candidato ya fue aceptado.');
        const r = await this.createInTx(
          tx,
          projectId,
          {
            requirementType: c.requirementType,
            name: c.name,
            description: c.description,
            priority: c.priority,
            actors: c.actors as string[],
            preconditions: c.preconditions as string[],
            postconditions: c.postconditions as string[],
            dependencyArtifactIds: [],
          },
          'AI_GENERATED',
          c.id,
          generation.sourceContextVersionId,
          generation.aiRunId,
        );
        created.set(c.id, r);
        await tx.requirementCandidate.update({
          where: { id: c.id },
          data: { acceptedArtifactId: r.id },
        });
      }
      for (const c of candidates) {
        const deps = c.outgoingDependencies.map((d) => created.get(d.dependsOnCandidateId)!.id);
        if (deps.length)
          await tx.requirementDependency.createMany({
            data: deps.map((dependsOnArtifactId) => ({
              artifactVersionId: created.get(c.id)!.version.id,
              dependsOnArtifactId,
            })),
          });
        created.get(c.id)!.requirement.dependencyArtifactIds = deps;
      }
      return { items: [...created.values()] };
    });
  }
  async transition(
    projectId: string,
    artifactId: string,
    id: string,
    status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
  ) {
    const v = await this.prisma.artifactVersion.findFirst({ where: { id, projectId, artifactId } });
    if (!v) throw new NotFoundException('Versión no encontrada.');
    if (!canTransitionArtifactVersionStatus(v.status, status))
      throw new UnprocessableEntityException('Transición de estado no permitida.');
    return this.prisma.artifactVersion.update({
      where: { id },
      data: {
        status,
        submittedAt: status === 'IN_REVIEW' ? new Date() : v.submittedAt,
        approvedAt: status === 'APPROVED' ? new Date() : v.approvedAt,
      },
    });
  }
  private async createInTx(
    tx: Tx,
    projectId: string,
    input: RequirementInput,
    origin: 'MANUAL' | 'AI_GENERATED',
    candidateId?: string,
    sourceContextVersionId?: string,
    aiRunId?: string,
  ) {
    if (!(await tx.project.findUnique({ where: { id: projectId } })))
      throw new NotFoundException('Proyecto no encontrado.');
    await this.validateDependencies(tx, projectId, undefined, input.dependencyArtifactIds);
    const prefix = input.requirementType === 'FUNCTIONAL' ? 'RF' : 'RNF';
    const rows = await tx.$queryRaw<
      { last_number: number }[]
    >`INSERT INTO project_code_counters(project_id,code_prefix,last_number) VALUES(${projectId}::uuid,${prefix},1) ON CONFLICT(project_id,code_prefix) DO UPDATE SET last_number=project_code_counters.last_number+1 RETURNING last_number`;
    const a = await tx.artifact.create({
      data: {
        projectId,
        artifactTypeCode: 'REQUIREMENT',
        code: formatArtifactCode(prefix, rows[0]!.last_number),
      },
    });
    const v = await tx.artifactVersion.create({
      data: {
        artifactId: a.id,
        projectId,
        versionNumber: 1,
        title: input.name,
        status: origin === 'MANUAL' ? 'DRAFT' : 'GENERATED',
        origin,
      },
    });
    await this.insertDetail(tx, v.id, input, candidateId, sourceContextVersionId, aiRunId);
    return this.map(
      a,
      await tx.artifactVersion.findUniqueOrThrow({
        where: { id: v.id },
        include: { requirementDetail: { include: detailInclude } },
      }),
    );
  }
  private async insertDetail(
    tx: Tx,
    versionId: string,
    input: RequirementInput,
    candidateId?: string,
    sourceContextVersionId?: string,
    aiRunId?: string,
  ) {
    await tx.requirementDetail.create({
      data: {
        artifactVersionId: versionId,
        requirementType: input.requirementType,
        name: input.name,
        description: input.description,
        priority: input.priority,
        generationCandidateId: candidateId,
        sourceContextVersionId,
        aiRunId,
        actors: { create: input.actors.map((name, position) => ({ position, name })) },
        preconditions: {
          create: input.preconditions.map((description, position) => ({ position, description })),
        },
        postconditions: {
          create: input.postconditions.map((description, position) => ({ position, description })),
        },
        dependencies: {
          create: input.dependencyArtifactIds.map((dependsOnArtifactId) => ({
            dependsOnArtifactId,
          })),
        },
      },
    });
  }
  private async validateDependencies(
    tx: Tx,
    projectId: string,
    self: string | undefined,
    ids: string[],
  ) {
    if (self && ids.includes(self))
      throw new UnprocessableEntityException('Un requisito no puede depender de sí mismo.');
    const count = await tx.artifact.count({
      where: { id: { in: ids }, projectId, artifactTypeCode: 'REQUIREMENT' },
    });
    if (count !== ids.length)
      throw new UnprocessableEntityException('Dependencia de requisito no válida.');
  }
  private map(
    a: { id: string; projectId: string; code: string; createdAt: Date },
    v: {
      id: string;
      versionNumber: number;
      status: string;
      origin: string;
      createdAt: Date;
      requirementDetail: unknown;
    },
  ): RequirementResponse {
    const d = v.requirementDetail as {
      requirementType: 'FUNCTIONAL' | 'NON_FUNCTIONAL';
      name: string;
      description: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      sourceContextVersionId: string | null;
      aiRunId: string | null;
      actors: { name: string }[];
      preconditions: { description: string }[];
      postconditions: { description: string }[];
      dependencies: { dependsOnArtifactId: string }[];
    };
    return {
      id: a.id,
      projectId: a.projectId,
      code: a.code,
      createdAt: a.createdAt.toISOString(),
      version: {
        id: v.id,
        versionNumber: v.versionNumber,
        status: v.status as RequirementResponse['version']['status'],
        origin: v.origin as RequirementResponse['version']['origin'],
        createdAt: v.createdAt.toISOString(),
      },
      requirement: {
        requirementType: d.requirementType,
        name: d.name,
        description: d.description,
        priority: d.priority,
        actors: d.actors.map((x) => x.name),
        preconditions: d.preconditions.map((x) => x.description),
        postconditions: d.postconditions.map((x) => x.description),
        dependencyArtifactIds: d.dependencies.map((x) => x.dependsOnArtifactId),
        sourceContextVersionId: d.sourceContextVersionId,
        aiRunId: d.aiRunId,
      },
    };
  }
}
