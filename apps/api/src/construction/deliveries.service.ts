import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  DeliveryPlanResponse,
  DeliveryStatus,
  ImplementationPlanContent,
  CreateDeliveryPlanRequest,
  SaveDeliveryPlanRequest,
} from '@caseflow-ai/contracts';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { loadApprovedPlan } from './approved-plan';
import { deliveryOrderProblems, moduleDependencies, proposeDeliveries } from './delivery-order';

const withDeliveries = {
  deliveries: {
    orderBy: { position: 'asc' },
    include: {
      modules: true,
      approvals: { select: { id: true } },
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
    return this.map(stored, await loadApprovedPlan(this.prisma, projectId, planVersionId));
  }

  // Without an order, the proposed one (dependencies first).
  async create(
    projectId: string,
    userId: string,
    planVersionId: string,
    input: CreateDeliveryPlanRequest = {},
  ): Promise<DeliveryPlanResponse> {
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
    const names = new Map(plan.modules.map((module) => [module.localId, module.name]));
    for (const [index, modules] of order.entries()) {
      const position = firstPosition + index;
      const delivery = await tx.delivery.create({
        data: {
          deliveryPlanId,
          position,
          name:
            position === 0 && plan.authentication.local
              ? 'Base'
              : modules.map((id) => names.get(id) ?? id).join(', '),
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

  private map(stored: StoredPlan, plan: ImplementationPlanContent): DeliveryPlanResponse {
    const modules = new Map(plan.modules.map((module) => [module.localId, module]));
    return {
      id: stored.id,
      implementationPlanVersionId: stored.implementationPlanVersionId,
      createdAt: stored.createdAt.toISOString(),
      deliveries: stored.deliveries.map((delivery) => ({
        id: delivery.id,
        position: delivery.position,
        name: delivery.name,
        status: statusOf(delivery),
        locked: isLocked(delivery),
        modules: delivery.modules.map(({ moduleLocalId }) => ({
          localId: moduleLocalId,
          name: modules.get(moduleLocalId)?.name ?? moduleLocalId,
          description: modules.get(moduleLocalId)?.description ?? '',
        })),
      })),
      dependencies: moduleDependencies(plan),
    };
  }
}

type StoredDelivery = StoredPlan['deliveries'][number];
const isLocked = (delivery: StoredDelivery) =>
  delivery.approvals.length > 0 || delivery._count.generationRuns > 0;
// AFFECTED is derived once deliveries are generated and approved (ADR-024, part 3).
const statusOf = (delivery: StoredDelivery): DeliveryStatus =>
  delivery.approvals.length ? 'APPROVED' : delivery._count.generationRuns ? 'GENERATED' : 'PENDING';
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((item) => b.includes(item));
