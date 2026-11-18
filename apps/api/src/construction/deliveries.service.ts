import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  ApproveDeliveryRequest,
  DeliveryPlanResponse,
  DeliveryStatus,
  ImplementationPlanContent,
  CreateDeliveryPlanRequest,
  SaveDeliveryPlanRequest,
} from '@caseflow-ai/contracts';
import { AuditService } from '../audit/audit.service';
import { assertCanGenerate } from '../common/generation-cancelled';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { loadApprovedPlan } from './approved-plan';
import { deliveryOrderProblems, moduleDependencies, proposeDeliveries } from './delivery-order';

const withDeliveries = {
  deliveries: {
    orderBy: { position: 'asc' },
    include: {
      modules: true,
      approvals: {
        orderBy: { approvedAt: 'desc' },
        select: {
          generationRunId: true,
          approvedByUserId: true,
          approvedAt: true,
          note: true,
        },
      },
      _count: { select: { generationRuns: true } },
    },
  },
} satisfies Prisma.DeliveryPlanInclude;
type StoredPlan = Prisma.DeliveryPlanGetPayload<{ include: typeof withDeliveries }>;

// ADR-024: the plan of deliveries of one approved implementation plan version.
// Delivery 0 is the base; each next one adds modules to the approved ones.
@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(projectId: string, planVersionId: string): Promise<DeliveryPlanResponse> {
    const stored = await this.prisma.deliveryPlan.findFirst({
      where: { projectId, implementationPlanVersionId: planVersionId },
      include: withDeliveries,
    });
    if (!stored)
      throw new NotFoundException(
        'Aún no hay un plan de entregas para este plan de implementación.',
      );
    const plan = await loadApprovedPlan(this.prisma, projectId, planVersionId);
    return this.map(stored, plan, await this.affected(stored, plan));
  }

  // A person approves a validated run of the delivery. An affected delivery
  // is approved again with the later run that changed it.
  async approve(
    projectId: string,
    userId: string,
    planVersionId: string,
    deliveryId: string,
    input: ApproveDeliveryRequest,
  ): Promise<DeliveryPlanResponse> {
    await assertCanGenerate(this.prisma, projectId, userId);
    const { stored, plan, affected } = await this.state(projectId, planVersionId);
    const delivery = stored.deliveries.find((item) => item.id === deliveryId);
    if (!delivery) throw new NotFoundException('Entrega no encontrada.');
    const run = await this.prisma.generationRun.findFirst({
      where: { id: input.generationRunId, projectId, implementationPlanVersionId: planVersionId },
      select: { id: true, deliveryId: true, snapshot: { select: { id: true } } },
    });
    if (!run) throw new NotFoundException('Corrida de construcción no encontrada.');
    const runDelivery = stored.deliveries.find((item) => item.id === run.deliveryId);
    if (!runDelivery || runDelivery.position < delivery.position)
      throw new UnprocessableEntityException('Esa corrida no construye esta entrega.');
    if (!run.snapshot)
      throw new UnprocessableEntityException(
        'Solo se aprueba una corrida validada, lista para desplegar.',
      );
    if (delivery.approvals.length && !affected.has(delivery.id))
      throw new ConflictException('Esta entrega ya está aprobada.');
    this.assertEarlierApproved(stored, affected, delivery.position, plan);
    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryApproval.create({
        data: {
          deliveryId,
          generationRunId: run.id,
          approvedByUserId: userId,
          note: input.note ?? null,
        },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'DELIVERY_APPROVED',
          entityType: 'DELIVERY',
          entityId: deliveryId,
          metadata: { generationRunId: run.id, reapproved: affected.has(deliveryId) },
        },
        tx,
      );
    });
    return this.get(projectId, planVersionId);
  }

  // A delivery is built on the approved ones: none of the earlier deliveries
  // may be pending or affected, and an approved one is not built again.
  async assertCanBuild(projectId: string, planVersionId: string, deliveryId: string) {
    const { stored, plan, affected } = await this.state(projectId, planVersionId);
    const delivery = stored.deliveries.find((item) => item.id === deliveryId);
    if (!delivery) throw new NotFoundException('Entrega no encontrada.');
    if (delivery.approvals.length && !affected.has(delivery.id))
      throw new ConflictException('Esta entrega ya está aprobada.');
    this.assertEarlierApproved(stored, affected, delivery.position, plan);
  }

  private assertEarlierApproved(
    stored: StoredPlan,
    affected: ReadonlySet<string>,
    position: number,
    plan: ImplementationPlanContent,
  ) {
    for (const earlier of stored.deliveries.filter((item) => item.position < position)) {
      const name = deliveryName(earlier, plan);
      if (!earlier.approvals.length)
        throw new UnprocessableEntityException(
          `Apruebe primero las entregas anteriores; falta la entrega ${earlier.position} («${name}»).`,
        );
      if (affected.has(earlier.id))
        throw new UnprocessableEntityException(
          `La entrega ${earlier.position} («${name}») cambió en una construcción posterior. Revísela y apruébela de nuevo antes de seguir.`,
        );
    }
  }

  private async state(projectId: string, planVersionId: string) {
    const stored = await this.prisma.deliveryPlan.findFirst({
      where: { projectId, implementationPlanVersionId: planVersionId },
      include: withDeliveries,
    });
    if (!stored)
      throw new NotFoundException(
        'Aún no hay un plan de entregas para este plan de implementación.',
      );
    const plan = await loadApprovedPlan(this.prisma, projectId, planVersionId);
    return { stored, plan, affected: await this.affected(stored, plan) };
  }

  // ADR-024: an approved delivery is affected when a later run of the plan
  // changed one of its files: those implementing only its screens or actions
  // (shared files, such as the menu or the test list, are not its own). The
  // later run is the most recent one built on it after the approval.
  private async affected(
    stored: StoredPlan,
    plan: ImplementationPlanContent,
  ): Promise<Set<string>> {
    const affected = new Set<string>();
    const approved = stored.deliveries.filter((delivery) => delivery.approvals.length);
    if (!approved.length) return affected;
    const runs = await this.prisma.generationRun.findMany({
      where: {
        projectId: stored.projectId,
        implementationPlanVersionId: stored.implementationPlanVersionId,
        status: 'GENERATED',
        OR: [{ deliveryId: null }, { delivery: { deliveryPlanId: stored.id } }],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, deliveryId: true, createdAt: true },
    });
    const positionOf = new Map(stored.deliveries.map((d) => [d.id, d.position]));
    const elementsOf = (modules: ReadonlySet<string>) =>
      new Set([
        ...plan.routes.filter((r) => modules.has(r.moduleLocalId)).map((r) => `route:${r.path}`),
        ...plan.customEndpoints
          .filter((e) => modules.has(e.moduleLocalId))
          .map((e) => `endpoint:${e.method} ${e.path}`),
      ]);
    const everyElement = elementsOf(new Set(plan.modules.map((module) => module.localId)));
    for (const delivery of approved) {
      const approval = delivery.approvals[0]!;
      const later = runs.find(
        (run) =>
          run.id !== approval.generationRunId &&
          run.createdAt > approval.approvedAt &&
          (run.deliveryId === null || positionOf.get(run.deliveryId)! > delivery.position),
      );
      if (!later) continue;
      const own = elementsOf(new Set(delivery.modules.map((module) => module.moduleLocalId)));
      const files = await this.prisma.generatedFile.findMany({
        where: { generationRunId: { in: [approval.generationRunId, later.id] } },
        select: {
          generationRunId: true,
          path: true,
          sha256: true,
          traceLinks: { select: { planElement: true } },
        },
      });
      const isOwn = (file: (typeof files)[number]) => {
        const elements = file.traceLinks
          .map((link) => link.planElement)
          .filter((element) => everyElement.has(element));
        return elements.length > 0 && elements.every((element) => own.has(element));
      };
      const after = new Map(
        files.filter((file) => file.generationRunId === later.id).map((f) => [f.path, f.sha256]),
      );
      if (
        files.some(
          (file) =>
            file.generationRunId === approval.generationRunId &&
            isOwn(file) &&
            after.get(file.path) !== file.sha256,
        )
      )
        affected.add(delivery.id);
    }
    return affected;
  }

  // Without an order, the proposed one (dependencies first).
  async create(
    projectId: string,
    userId: string,
    planVersionId: string,
    input: CreateDeliveryPlanRequest = {},
  ): Promise<DeliveryPlanResponse> {
    // Planning, building and approving deliveries: the roles that generate.
    await assertCanGenerate(this.prisma, projectId, userId);
    const plan = await loadApprovedPlan(this.prisma, projectId, planVersionId);
    const order = input.deliveries?.map((delivery) => delivery.modules) ?? proposeDeliveries(plan);
    this.assertBuildable(plan, order);
    const created = await this.prisma.$transaction(async (tx) => {
      if (
        await tx.deliveryPlan.findUnique({ where: { implementationPlanVersionId: planVersionId } })
      )
        throw new ConflictException('Este plan de implementación ya tiene un plan de entregas.');
      const deliveryPlan = await tx.deliveryPlan.create({
        data: { projectId, implementationPlanVersionId: planVersionId, createdByUserId: userId },
      });
      await this.createDeliveries(tx, deliveryPlan.id, plan, order, 0);
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'DELIVERY_PLAN_CREATED',
          entityType: 'DELIVERY_PLAN',
          entityId: deliveryPlan.id,
          metadata: { implementationPlanVersionId: planVersionId, deliveries: order.length },
        },
        tx,
      );
      return deliveryPlan;
    });
    return this.get(projectId, created.implementationPlanVersionId);
  }

  // Reorders or regroups the deliveries not generated yet; the generated and
  // approved ones keep their place and modules.
  async save(
    projectId: string,
    userId: string,
    planVersionId: string,
    input: SaveDeliveryPlanRequest,
  ): Promise<DeliveryPlanResponse> {
    await assertCanGenerate(this.prisma, projectId, userId);
    const plan = await loadApprovedPlan(this.prisma, projectId, planVersionId);
    const order = input.deliveries.map((delivery) => delivery.modules);
    this.assertBuildable(plan, order);
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.deliveryPlan.findFirst({
        where: { projectId, implementationPlanVersionId: planVersionId },
        select: { id: true },
      });
      if (!found)
        throw new NotFoundException(
          'Aún no hay un plan de entregas para este plan de implementación.',
        );
      // A run starting meanwhile would lock a delivery being replaced.
      await tx.$queryRaw`SELECT id FROM delivery_plans WHERE id = ${found.id}::uuid FOR UPDATE`;
      const stored = await tx.deliveryPlan.findUniqueOrThrow({
        where: { id: found.id },
        include: withDeliveries,
      });
      const locked = stored.deliveries.filter(isLocked);
      const kept = locked.length ? Math.max(...locked.map((d) => d.position)) + 1 : 0;
      for (const delivery of stored.deliveries.slice(0, kept)) {
        const requested = order[delivery.position];
        const current = delivery.modules.map((m) => m.moduleLocalId);
        if (!requested || !sameSet(requested, current))
          throw new UnprocessableEntityException(
            `La entrega ${delivery.position} ya se generó y no puede cambiar de módulos ni de lugar.`,
          );
      }
      const replaced = stored.deliveries.slice(kept).map((delivery) => delivery.id);
      await tx.deliveryModule.deleteMany({ where: { deliveryId: { in: replaced } } });
      await tx.delivery.deleteMany({ where: { id: { in: replaced } } });
      await this.createDeliveries(tx, stored.id, plan, order.slice(kept), kept);
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'DELIVERY_PLAN_CHANGED',
          entityType: 'DELIVERY_PLAN',
          entityId: stored.id,
          metadata: { deliveries: order.length, kept },
        },
        tx,
      );
    });
    return this.get(projectId, planVersionId);
  }

  private assertBuildable(plan: ImplementationPlanContent, order: string[][]) {
    const problems = deliveryOrderProblems(plan, order);
    if (problems.length) throw new UnprocessableEntityException(problems.join(' '));
  }

  private async createDeliveries(
    tx: Prisma.TransactionClient,
    deliveryPlanId: string,
    plan: ImplementationPlanContent,
    order: string[][],
    firstPosition: number,
  ) {
    for (const [index, modules] of order.entries()) {
      const position = firstPosition + index;
      const first = plan.modules.find((module) => module.localId === modules[0]);
      const delivery = await tx.delivery.create({
        data: {
          deliveryPlanId,
          position,
          // Spanish for the person: the plan's module names are internal.
          name:
            position === 0 && plan.authentication.local
              ? 'Base: acceso, usuarios y roles'
              : `${moduleLabel(first)}${modules.length > 1 ? ` y ${modules.length - 1} más` : ''}`,
        },
      });
      await tx.deliveryModule.createMany({
        data: modules.map((moduleLocalId) => ({
          deliveryPlanId,
          deliveryId: delivery.id,
          moduleLocalId,
        })),
      });
    }
  }

  private map(
    stored: StoredPlan,
    plan: ImplementationPlanContent,
    affected: ReadonlySet<string>,
  ): DeliveryPlanResponse {
    const modules = new Map(plan.modules.map((module) => [module.localId, module]));
    return {
      id: stored.id,
      implementationPlanVersionId: stored.implementationPlanVersionId,
      createdAt: stored.createdAt.toISOString(),
      deliveries: stored.deliveries.map((delivery) => ({
        id: delivery.id,
        position: delivery.position,
        name: delivery.name,
        status: affected.has(delivery.id) ? 'AFFECTED' : statusOf(delivery),
        locked: isLocked(delivery),
        modules: delivery.modules.map(({ moduleLocalId }) => ({
          localId: moduleLocalId,
          name: moduleLabel(modules.get(moduleLocalId)) || moduleLocalId,
          description: modules.get(moduleLocalId)?.description ?? '',
        })),
        approval: delivery.approvals[0]
          ? {
              generationRunId: delivery.approvals[0].generationRunId,
              approvedByUserId: delivery.approvals[0].approvedByUserId,
              approvedAt: delivery.approvals[0].approvedAt.toISOString(),
              note: delivery.approvals[0].note,
            }
          : null,
      })),
      dependencies: moduleDependencies(plan),
    };
  }
}

type StoredDelivery = StoredPlan['deliveries'][number];
const isLocked = (delivery: StoredDelivery) =>
  delivery.approvals.length > 0 || delivery._count.generationRuns > 0;
const statusOf = (delivery: StoredDelivery): DeliveryStatus =>
  delivery.approvals.length ? 'APPROVED' : delivery._count.generationRuns ? 'GENERATED' : 'PENDING';
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((item) => b.includes(item));

// A module's name for the person: the first sentence of its description,
// in the project's language; the plan's names are internal identifiers.
function moduleLabel(module: { name: string; description: string } | undefined): string {
  if (!module) return '';
  const sentence = module.description
    .split(/(?<=[.;:])\s/)[0]!
    .replace(/[.;:]$/, '')
    .trim();
  if (!sentence) return module.name;
  return sentence.length <= 80 ? sentence : `${sentence.slice(0, 79).replace(/\s+\S*$/, '')}…`;
}

const deliveryName = (delivery: StoredDelivery, plan: ImplementationPlanContent) =>
  delivery.name ||
  moduleLabel(plan.modules.find((m) => m.localId === delivery.modules[0]?.moduleLocalId));
