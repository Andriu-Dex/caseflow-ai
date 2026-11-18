import type { ImplementationPlanContent } from '@caseflow-ai/contracts';

type Plan = ImplementationPlanContent;
const endpointKey = (endpoint: { method: string; path: string }) =>
  `${endpoint.method} ${endpoint.path}`;

// Why one module needs another to be built first (ADR-024): a screen of the
// module calls an action, or loads data, that another module provides. All
// entities exist from delivery 0, so sharing an entity is not a dependency,
// and a navigation link to a screen not built yet is hidden, not required.
export type ModuleDependency = { module: string; needs: string; reason: string };

export function moduleDependencies(plan: Plan): ModuleDependency[] {
  const endpointModule = new Map(
    plan.customEndpoints.map((endpoint) => [endpointKey(endpoint), endpoint.moduleLocalId]),
  );
  const entityModule = new Map(
    plan.entities.map((entity) => [entity.localId, entity.moduleLocalId]),
  );
  const found = new Map<string, ModuleDependency>();
  const add = (module: string, needs: string | undefined, reason: string) => {
    if (!needs || needs === module) return;
    const key = `${module}>${needs}`;
    if (!found.has(key)) found.set(key, { module, needs, reason });
  };
  for (const route of plan.routes) {
    for (const action of route.actions) {
      if (action.endpoint)
        add(
          route.moduleLocalId,
          endpointModule.get(action.endpoint),
          `la pantalla «${route.screenName}» usa la acción ${action.endpoint}`,
        );
      if (action.navigation?.sourceEndpoint)
        add(
          route.moduleLocalId,
          endpointModule.get(action.navigation.sourceEndpoint),
          `la pantalla «${route.screenName}» carga datos de ${action.navigation.sourceEndpoint}`,
        );
      if (action.operation && route.entityLocalId)
        add(
          route.moduleLocalId,
          entityModule.get(route.entityLocalId),
          `la pantalla «${route.screenName}» gestiona una entidad de ese módulo`,
        );
    }
    for (const query of route.contextQueries ?? [])
      add(
        route.moduleLocalId,
        endpointModule.get(query),
        `la pantalla «${route.screenName}» consulta ${query}`,
      );
  }
  return [...found.values()];
}

// The modules that hold sign-in, users, sessions, roles, the operation
// scope and the audit trail, plus the sign-in screen: delivery 0 (the base).
function baseModules(plan: Plan, dependencies: ModuleDependency[]): Set<string> {
  const local = plan.authentication.local;
  const entityModule = new Map(
    plan.entities.map((entity) => [entity.localId, entity.moduleLocalId]),
  );
  const base = new Set<string>();
  if (local) {
    const user = plan.entities.find((entity) => entity.localId === local.userEntityLocalId);
    const roleTarget = user?.relations.find((relation) => relation.name === local.roleRelation);
    for (const entityId of [
      local.userEntityLocalId,
      local.sessionEntityLocalId,
      roleTarget?.targetEntityLocalId,
      local.scope?.entityLocalId,
      local.audit?.entityLocalId,
    ]) {
      const module = entityId ? entityModule.get(entityId) : undefined;
      if (module) base.add(module);
    }
  }
  for (const route of plan.routes)
    if (route.builtinView === 'ACCOUNT_ACCESS') base.add(route.moduleLocalId);
  // What the base itself needs is part of it.
  let grew = true;
  while (grew) {
    grew = false;
    for (const dependency of dependencies)
      if (base.has(dependency.module) && !base.has(dependency.needs)) {
        base.add(dependency.needs);
        grew = true;
      }
  }
  return base;
}

// Proposed deliveries, as module localIds: the base first, then one module
// per delivery in dependency order, keeping the plan's order otherwise.
// Modules that need each other go together in one delivery.
export function proposeDeliveries(plan: Plan): string[][] {
  const order = plan.modules.map((module) => module.localId);
  const dependencies = moduleDependencies(plan);
  const base = baseModules(plan, dependencies);
  const needs = new Map(order.map((id) => [id, new Set<string>()]));
  for (const dependency of dependencies) needs.get(dependency.module)?.add(dependency.needs);
  const reaches = (from: string, to: string) => {
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length) {
      const current = stack.pop()!;
      if (current === to) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...(needs.get(current) ?? []));
    }
    return false;
  };
  // Groups of modules that need each other (strongly connected).
  const groupOf = new Map<string, string[]>();
  for (const id of order) {
    if (groupOf.has(id)) continue;
    const group = order.filter(
      (other) =>
        !groupOf.has(other) && (other === id || (reaches(id, other) && reaches(other, id))),
    );
    for (const member of group) groupOf.set(member, group);
  }
  const deliveries: string[][] = [order.filter((id) => base.has(id))];
  const placed = new Set(deliveries[0]);
  while (placed.size < order.length) {
    const next = order.find(
      (id) =>
        !placed.has(id) &&
        groupOf
          .get(id)!
          .every((member) =>
            [...needs.get(member)!].every(
              (need) => placed.has(need) || groupOf.get(id)!.includes(need),
            ),
          ),
    )!;
    const group = groupOf.get(next)!;
    deliveries.push(group);
    for (const member of group) placed.add(member);
  }
  return deliveries[0]!.length ? deliveries : deliveries.slice(1);
}

// Why an order of deliveries cannot be built, in words for the person.
export function deliveryOrderProblems(plan: Plan, deliveries: string[][]): string[] {
  const names = new Map(plan.modules.map((module) => [module.localId, module.name]));
  const name = (id: string) => names.get(id) ?? id;
  const problems: string[] = [];
  const position = new Map<string, number>();
  deliveries.forEach((modules, index) => {
    if (!modules.length) problems.push(`La entrega ${index} no tiene módulos.`);
    for (const id of modules) {
      if (!names.has(id)) problems.push(`El módulo «${id}» no existe en el plan.`);
      else if (position.has(id)) problems.push(`El módulo «${name(id)}» está en dos entregas.`);
      else position.set(id, index);
    }
  });
  for (const id of names.keys())
    if (!position.has(id)) problems.push(`El módulo «${name(id)}» no está en ninguna entrega.`);
  if (problems.length) return problems;
  const dependencies = moduleDependencies(plan);
  for (const id of baseModules(plan, dependencies))
    if (position.get(id) !== 0)
      problems.push(
        `El módulo «${name(id)}» forma parte de la base (inicio de sesión, usuarios y roles) y debe ir en la entrega 0.`,
      );
  for (const dependency of dependencies)
    if (position.get(dependency.needs)! > position.get(dependency.module)!)
      problems.push(
        `«${name(dependency.module)}» necesita «${name(dependency.needs)}», que va en una entrega posterior: ${dependency.reason}.`,
      );
  return problems;
}
