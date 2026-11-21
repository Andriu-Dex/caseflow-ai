import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  dataModelInputSchema,
  startingPointContentSchema,
  type ApplyStartingPointResponse,
  type SaveStartingPointRequest,
  type StartingPoint,
  type StartingPointContent,
} from '@caseflow-ai/contracts';
import { AuditService } from '../audit/audit.service';
import { assertCanGenerate } from '../common/generation-cancelled';
import { PrismaService } from '../database/prisma.service';
import { DataModelsService } from '../data-models/data-models.service';
import { RequirementsService } from '../requirements/requirements.service';
import { UseCasesService } from '../use-cases/use-cases.service';
import { ACCESO_USUARIOS_ROLES } from './library/acceso-usuarios-roles';

// Built-in starting points: generic data shipped with CASEFlow, never code of
// a particular project.
const BUILT_IN = [{ id: 'builtin-acceso-usuarios-roles', ...ACCESO_USUARIOS_ROLES }].map(
  (item) => ({ ...item, content: startingPointContentSchema.parse(item.content) }),
);

const countsOf = (content: StartingPointContent) => ({
  requirements: content.requirements.length,
  useCases: content.useCases.length,
  entities: content.dataModel?.entities.length ?? 0,
});

// DEC-176: starting a project from a similar one. A starting point packages
// approved requirements, use cases and a data model; applying it copies them
// into a project as drafts, linked as they were, for the person to adapt and
// approve like any other artifact.
@Injectable()
export class StartingPointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly requirements: RequirementsService,
    private readonly useCases: UseCasesService,
    private readonly dataModels: DataModelsService,
  ) {}

  async list(projectId: string): Promise<{ items: StartingPoint[] }> {
    const workspaceId = await this.workspaceOf(projectId);
    const saved = await this.prisma.startingPoint.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: [
        ...BUILT_IN.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          builtIn: true,
          counts: countsOf(item.content),
          createdAt: null,
        })),
        ...saved.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          builtIn: false,
          counts: countsOf(startingPointContentSchema.parse(row.content)),
          createdAt: row.createdAt.toISOString(),
        })),
      ],
    };
  }

  // The project's approved requirements, the approved use cases that realize
  // them and its approved data model, as a starting point of the workspace.
  async save(
    projectId: string,
    userId: string,
    input: SaveStartingPointRequest,
  ): Promise<StartingPoint> {
    await assertCanGenerate(this.prisma, projectId, userId);
    const content = await this.packageOf(projectId);
    if (!content.requirements.length)
      throw new UnprocessableEntityException(
        'El proyecto aún no tiene requisitos aprobados que guardar.',
      );
    const row = await this.prisma.startingPoint.create({
      data: {
        workspaceId: await this.workspaceOf(projectId),
        name: input.name,
        description: input.description,
        content,
        sourceProjectId: projectId,
        createdByUserId: userId,
      },
    });
    await this.audit.record({
      projectId,
      actorUserId: userId,
      action: 'STARTING_POINT_SAVED',
      entityType: 'STARTING_POINT',
      entityId: row.id,
      metadata: countsOf(content),
    });
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      builtIn: false,
      counts: countsOf(content),
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ponytail: each artifact is created by its own service and transaction, so a
  // failure halfway keeps the drafts created so far (they can be archived); one
  // transaction across the services would need them to accept a client.
  // Copies the starting point into the project as drafts. Requirements come
  // first (each after those it depends on), then the use cases linked to
  // them, then the data model.
  async apply(
    projectId: string,
    userId: string,
    startingPointId: string,
  ): Promise<ApplyStartingPointResponse> {
    await assertCanGenerate(this.prisma, projectId, userId);
    const { name, content } = await this.find(projectId, startingPointId);
    const origin = {
      kind: 'USER_DECISION' as const,
      justification: `Tomado del punto de partida «${name}». Revíselo y adáptelo al proyecto.`,
    };
    const requirementIds = new Map<string, { artifactId: string; versionId: string }>();
    const pending = [...content.requirements];
    while (pending.length) {
      const ready = pending.findIndex((item) =>
        item.dependsOn.every(
          (key) => requirementIds.has(key) || !pending.some((p) => p.key === key),
        ),
      );
      // A dependency cycle is broken at the first remaining requirement.
      const [item] = pending.splice(ready === -1 ? 0 : ready, 1);
      const created = await this.requirements.create(projectId, {
        requirementType: item!.requirementType,
        name: item!.name,
        description: item!.description,
        priority: item!.priority,
        actors: item!.actors,
        preconditions: item!.preconditions,
        postconditions: item!.postconditions,
        dependencyArtifactIds: item!.dependsOn.flatMap((key) =>
          requirementIds.has(key) ? [requirementIds.get(key)!.artifactId] : [],
        ),
        origin,
      });
      requirementIds.set(item!.key, { artifactId: created.id, versionId: created.version.id });
    }
    const useCaseIds = new Map<string, string>();
    for (const item of content.useCases) {
      const linked = item.requirementKeys.flatMap((key) =>
        requirementIds.has(key) ? [requirementIds.get(key)!.versionId] : [],
      );
      if (!linked.length) continue;
      const created = await this.useCases.create(projectId, {
        name: item.name,
        objective: item.objective,
        primaryActor: item.primaryActor,
        secondaryActors: item.secondaryActors,
        preconditions: item.preconditions,
        postconditions: item.postconditions,
        mainFlow: item.mainFlow,
        alternativeFlows: item.alternativeFlows,
        relatedRequirementVersionIds: linked,
        // Only to use cases copied before this one.
        relations: item.relations.flatMap((relation) =>
          useCaseIds.has(relation.targetKey)
            ? [{ kind: relation.kind, targetUseCaseId: useCaseIds.get(relation.targetKey)! }]
            : [],
        ),
      });
      useCaseIds.set(item.key, created.id);
    }
    if (content.dataModel) await this.dataModels.create(projectId, content.dataModel);
    const result = {
      requirements: requirementIds.size,
      useCases: useCaseIds.size,
      entities: content.dataModel?.entities.length ?? 0,
    };
    await this.audit.record({
      projectId,
      actorUserId: userId,
      action: 'STARTING_POINT_APPLIED',
      // A built-in starting point has no row: the project it went into is the entity.
      entityType: startingPointId.startsWith('builtin-') ? 'PROJECT' : 'STARTING_POINT',
      entityId: startingPointId.startsWith('builtin-') ? projectId : startingPointId,
      metadata: { ...result, startingPointId },
    });
    return result;
  }

  // Only a saved starting point of the project's workspace is removed.
  async remove(projectId: string, userId: string, startingPointId: string): Promise<void> {
    await assertCanGenerate(this.prisma, projectId, userId);
    if (startingPointId.startsWith('builtin-'))
      throw new ForbiddenException('Los puntos de partida incluidos no se pueden eliminar.');
    const { count } = await this.prisma.startingPoint.deleteMany({
      where: { id: startingPointId, workspaceId: await this.workspaceOf(projectId) },
    });
    if (!count) throw new NotFoundException('Punto de partida no encontrado.');
  }

  private async find(projectId: string, id: string) {
    const builtIn = BUILT_IN.find((item) => item.id === id);
    if (builtIn) return builtIn;
    if (id.startsWith('builtin-')) throw new NotFoundException('Punto de partida no encontrado.');
    const row = await this.prisma.startingPoint.findFirst({
      where: { id, workspaceId: await this.workspaceOf(projectId) },
    });
    if (!row) throw new NotFoundException('Punto de partida no encontrado.');
    return { name: row.name, content: startingPointContentSchema.parse(row.content) };
  }

  private async workspaceOf(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');
    return project.workspaceId;
  }

  private async packageOf(projectId: string): Promise<StartingPointContent> {
    const requirements = (await this.requirements.listApproved(projectId)).items;
    const useCases = (await this.useCases.listApproved(projectId)).items;
    const keyOfRequirementArtifact = new Map(requirements.map((item) => [item.id, item.code]));
    // A use case may cite an earlier version of a requirement.
    const versionCodes = new Map(
      (
        await this.prisma.artifactVersion.findMany({
          where: {
            id: { in: useCases.flatMap((item) => item.useCase.relatedRequirementVersionIds) },
          },
          select: { id: true, artifact: { select: { code: true } } },
        })
      ).map((version) => [version.id, version.artifact.code]),
    );
    const included = new Set(requirements.map((item) => item.code));
    const useCaseKey = new Map(useCases.map((item) => [item.id, item.code]));
    const models = (await this.dataModels.list(projectId)).items.filter(
      (item) => item.version.status === 'APPROVED',
    );
    const model = models[0]?.dataModel;
    return startingPointContentSchema.parse({
      requirements: requirements.map((item) => ({
        key: item.code,
        requirementType: item.requirement.requirementType,
        name: item.requirement.name,
        description: item.requirement.description,
        priority: item.requirement.priority,
        actors: item.requirement.actors,
        preconditions: item.requirement.preconditions,
        postconditions: item.requirement.postconditions,
        dependsOn: item.requirement.dependencyArtifactIds.flatMap((id) =>
          keyOfRequirementArtifact.has(id) ? [keyOfRequirementArtifact.get(id)!] : [],
        ),
      })),
      useCases: useCases.flatMap((item) => {
        const requirementKeys = [
          ...new Set(
            item.useCase.relatedRequirementVersionIds
              .map((id) => versionCodes.get(id))
              .filter((code): code is string => Boolean(code && included.has(code))),
          ),
        ];
        if (!requirementKeys.length) return [];
        return [
          {
            key: item.code,
            name: item.useCase.name,
            objective: item.useCase.objective,
            primaryActor: item.useCase.primaryActor,
            secondaryActors: item.useCase.secondaryActors,
            preconditions: item.useCase.preconditions,
            postconditions: item.useCase.postconditions,
            mainFlow: item.useCase.mainFlow,
            alternativeFlows: item.useCase.alternativeFlows,
            requirementKeys,
            relations: item.useCase.relations.flatMap((relation) =>
              useCaseKey.has(relation.targetUseCaseId)
                ? [{ kind: relation.kind, targetKey: useCaseKey.get(relation.targetUseCaseId)! }]
                : [],
            ),
          },
        ];
      }),
      dataModel: model
        ? dataModelInputSchema.parse({
            title: model.title,
            modelKind: model.modelKind,
            entities: model.entities,
            relationships: model.relationships,
          })
        : null,
    });
  }
}
