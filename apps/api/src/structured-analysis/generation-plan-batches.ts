import { AIError } from '@caseflow-ai/ai';
import {
  generationPlanContentSchema,
  type GenerationPlanContent,
  type PlanOutline,
} from '@caseflow-ai/contracts';

// DEC-144: functional modules per batch. Each module brings its workflows and
// screens, so a batch of this size fits one response with room to spare.
export const PLAN_BATCH_SIZE = 6;
// Times a batch is asked for: once, and twice more for the modules left without a screen.
export const PLAN_BATCH_ATTEMPTS = 3;

export type PlanModule = GenerationPlanContent['modules'][number];
export type PlanWorkflow = GenerationPlanContent['workflows'][number];
export type PlanScreen = GenerationPlanContent['screens'][number];
export interface PlanDetail {
  workflows: PlanWorkflow[];
  screens: PlanScreen[];
}

// What a plan may cite; anything else is dropped from the element rather than
// failing a long run.
export interface PlanCodes {
  requirements: Set<string>;
  useCases: Set<string>;
  sources: Set<string>;
}

const invalid = (message: string): never => {
  throw new AIError('AI_INVALID_OUTPUT', message);
};
const key = (value: string) => value.trim().toLocaleLowerCase('es');
const only = (codes: string[] | undefined, allowed: Set<string>) =>
  [...new Set(codes ?? [])].filter((code) => allowed.has(code));

export function planDetailBatches(modules: PlanModule[]): PlanModule[][] {
  return Array.from({ length: Math.ceil(modules.length / PLAN_BATCH_SIZE) }, (_, index) =>
    modules.slice(index * PLAN_BATCH_SIZE, (index + 1) * PLAN_BATCH_SIZE),
  );
}

// The outline: the plan without its workflows and screens. Citations the
// selection does not support are dropped; the use cases a module relates are
// also among its justifying sources.
export function cleanOutline(outline: PlanOutline, codes: PlanCodes): PlanOutline {
  const seen = new Set<string>();
  // Each entity has one owner module: the first that lists it (the prompt asks
  // for the owner, this only guards against a repeat).
  const owned = new Set<string>();
  const modules = outline.modules.map((module) => {
    let localId = module.localId;
    for (let n = 2; seen.has(localId); n += 1) localId = `${module.localId}-${n}`;
    seen.add(localId);
    const relatedUseCaseCodes = only(module.relatedUseCaseCodes, codes.useCases);
    const entityNames = module.entityNames.filter((name) => {
      const entity = key(name);
      if (owned.has(entity)) return false;
      owned.add(entity);
      return true;
    });
    return {
      ...module,
      localId,
      entityNames,
      relatedRequirementCodes: only(module.relatedRequirementCodes, codes.requirements),
      relatedUseCaseCodes,
      relatedSourceCodes: [
        ...new Set([...only(module.relatedSourceCodes, codes.sources), ...relatedUseCaseCodes]),
      ],
    };
  });
  const names = new Set(modules.map((module) => key(module.name)));
  if (names.size !== modules.length) invalid('El plan repite el nombre de un módulo.');
  return { ...outline, modules };
}

export interface PlanAccumulated {
  workflows: PlanWorkflow[];
  screens: PlanScreen[];
}

// Adds one batch's workflows and screens to those already drawn. A screen is
// assigned to a module of this batch or of an earlier one; a workflow or a
// screen already drawn (same name) is dropped.
export function mergePlanBatch(
  accumulated: PlanAccumulated,
  output: PlanDetail,
  modules: PlanModule[],
  codes: PlanCodes,
  allModuleIds: Set<string>,
): PlanAccumulated {
  const moduleIds = new Set(modules.map((module) => module.localId));
  const workflows = [...accumulated.workflows];
  const workflowNames = new Set(workflows.map((workflow) => key(workflow.name)));
  const workflowIds = new Set(workflows.map((workflow) => workflow.localId));
  for (const workflow of output.workflows) {
    if (workflowNames.has(key(workflow.name))) continue;
    workflowNames.add(key(workflow.name));
    let localId = workflow.localId;
    for (let n = 2; workflowIds.has(localId); n += 1) localId = `${workflow.localId}-${n}`;
    workflowIds.add(localId);
    const relatedUseCaseCodes = only(workflow.relatedUseCaseCodes, codes.useCases);
    workflows.push({
      ...workflow,
      localId,
      relatedUseCaseCodes,
      relatedSourceCodes: [
        ...new Set([...only(workflow.relatedSourceCodes, codes.sources), ...relatedUseCaseCodes]),
      ],
    });
  }
  const screens = [...accumulated.screens];
  const screenKeys = new Set(
    screens.map((screen) => `${screen.moduleLocalId}|${key(screen.name)}`),
  );
  for (const screen of output.screens) {
    if (!screen.moduleLocalId) invalid('Una pantalla no indica el módulo al que pertenece.');
    if (!moduleIds.has(screen.moduleLocalId!)) {
      // A module of another batch is a repeat (dropped); one that does not exist is invented.
      if (!allModuleIds.has(screen.moduleLocalId!))
        invalid('Una pantalla pertenece a un módulo que no existe en el plan.');
      continue;
    }
    const screenKey = `${screen.moduleLocalId}|${key(screen.name)}`;
    if (screenKeys.has(screenKey)) continue;
    screenKeys.add(screenKey);
    screens.push({ ...screen, relatedSourceCodes: only(screen.relatedSourceCodes, codes.sources) });
  }
  return { workflows, screens };
}

export const modulesWithoutScreen = (accumulated: PlanAccumulated, modules: PlanModule[]) => {
  const done = new Set(accumulated.screens.map((screen) => screen.moduleLocalId));
  return modules.filter((module) => !done.has(module.localId));
};

// Last resort for a module the model drew no screen for: one that opens it,
// named and described like the module itself.
export function fillMissingScreens(
  accumulated: PlanAccumulated,
  missing: PlanModule[],
): PlanAccumulated {
  return {
    workflows: accumulated.workflows,
    screens: [
      ...accumulated.screens,
      ...missing.map((module) => ({
        name: module.name,
        moduleLocalId: module.localId,
        purpose: module.purpose,
        ...(module.relatedSourceCodes ? { relatedSourceCodes: module.relatedSourceCodes } : {}),
      })),
    ],
  };
}

export function finishGenerationPlan(
  outline: PlanOutline,
  accumulated: PlanAccumulated,
): GenerationPlanContent {
  const checked = generationPlanContentSchema.safeParse({ ...outline, ...accumulated });
  if (!checked.success) return invalid('El plan reunido contiene elementos inválidos.');
  return checked.data;
}
