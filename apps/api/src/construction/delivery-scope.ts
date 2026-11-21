import { NotFoundException } from '@nestjs/common';
import type { ImplementationPlanContent, ProjectLanguage } from '@caseflow-ai/contracts';
import { pagePath } from '../code-generation/engine/frontend.templates';
import type { GeneratedProjectFile } from '../code-generation/engine/types';
import type { PrismaService } from '../database/prisma.service';
import { loadApprovedPlan } from './approved-plan';

type Plan = ImplementationPlanContent;

// ADR-024: what a delivery builds. Every module and entity stays (the whole
// schema exists from delivery 0, and the reuse keys of actions include every
// entity); the actions, screens and tests are only those of the delivered
// modules. Route actions are kept as they are: a screen's reuse key depends
// on its generated page, so dropping a link would regenerate an approved
// screen when the linked one is delivered.
// Validation reads the stored plan as it was saved, where lists left empty
// may be absent, so each one is read defensively.
export function scopePlan(plan: Plan, modules: ReadonlySet<string>): Plan {
  return {
    ...plan,
    customEndpoints: (plan.customEndpoints ?? []).filter((e) => modules.has(e.moduleLocalId)),
    routes: (plan.routes ?? []).filter((route) => modules.has(route.moduleLocalId)),
    tests: (plan.tests ?? []).filter((test) => modules.has(test.moduleLocalId)),
  };
}

const NOTICE: Record<ProjectLanguage, { title: string; body: string }> = {
  ES: {
    title: 'Sección en construcción',
    body: 'Esta sección llegará en una próxima entrega.',
  },
  EN: {
    title: 'Section in progress',
    body: 'This section will arrive in a later delivery.',
  },
};

// A link to a screen not delivered yet opens this notice instead of an error.
export function deferredPages(
  plan: Plan,
  modules: ReadonlySet<string>,
  language: ProjectLanguage,
): GeneratedProjectFile[] {
  const notice = NOTICE[language];
  return plan.routes
    .filter((route) => !modules.has(route.moduleLocalId))
    .map((route) => ({
      path: pagePath(route.path),
      content: `export default function DeferredSection() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-2 p-8 text-center">
      <h1 className="text-xl font-semibold">${notice.title}</h1>
      <p className="text-muted-foreground">${notice.body}</p>
    </main>
  );
}
`,
      origin: 'TEMPLATE' as const,
      kind: 'SOURCE' as const,
      planElements: [],
    }));
}

// The modules a delivery builds: its own and those of every earlier delivery.
export async function deliveryScope(prisma: PrismaService, projectId: string, deliveryId: string) {
  const delivery = await prisma.delivery.findFirst({
    where: { id: deliveryId, deliveryPlan: { projectId } },
    include: { deliveryPlan: { include: { deliveries: { include: { modules: true } } } } },
  });
  if (!delivery) throw new NotFoundException('Entrega no encontrada.');
  const earlier = delivery.deliveryPlan.deliveries.filter((d) => d.position <= delivery.position);
  return {
    deliveryId: delivery.id,
    position: delivery.position,
    deliveryPlanId: delivery.deliveryPlanId,
    implementationPlanVersionId: delivery.deliveryPlan.implementationPlanVersionId,
    earlierDeliveryIds: earlier.filter((d) => d.id !== delivery.id).map((d) => d.id),
    modules: new Set(earlier.flatMap((d) => d.modules.map((m) => m.moduleLocalId))),
  };
}

// The plan a run was built from: the whole approved plan, or its delivery's.
export async function planForRun(
  prisma: PrismaService,
  projectId: string,
  run: { implementationPlanVersionId: string; deliveryId: string | null },
): Promise<Plan> {
  const plan = await loadApprovedPlan(prisma, projectId, run.implementationPlanVersionId);
  if (!run.deliveryId) return plan;
  return scopePlan(plan, (await deliveryScope(prisma, projectId, run.deliveryId)).modules);
}
