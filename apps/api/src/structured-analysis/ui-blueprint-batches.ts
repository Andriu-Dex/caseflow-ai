import { AIError } from '@caseflow-ai/ai';
import {
  uiBlueprintContentSchema,
  type NavigationTreeContent,
  type UiBlueprintContent,
} from '@caseflow-ai/contracts';

// DEC-143: navigation views per batch. A screen carries its sections, actions,
// data and forms, so a batch of this size fits one response with room to spare.
export const UI_BATCH_SIZE = 6;
// Times a batch is asked for: once, and twice more for the views it left out.
export const UI_BATCH_ATTEMPTS = 3;

export type Screen = UiBlueprintContent['screens'][number];
export type NavNode = NavigationTreeContent['nodes'][number];
export interface UiBatchOutput {
  screens: Screen[];
}

const invalid = (message: string): never => {
  throw new AIError('AI_INVALID_OUTPUT', message);
};

// Sections only group views; every other node is something the user opens and
// needs a screen (DEC-121).
export const viewNodes = (nodes: NavNode[]) => nodes.filter((node) => node.kind !== 'SECTION');

export function planUiBatches(nodes: NavNode[]): NavNode[][] {
  const views = viewNodes(nodes);
  return Array.from({ length: Math.ceil(views.length / UI_BATCH_SIZE) }, (_, index) =>
    views.slice(index * UI_BATCH_SIZE, (index + 1) * UI_BATCH_SIZE),
  );
}

export interface MergeOptions {
  // Views drawn in earlier batches: a repeat of one is dropped.
  knownNodeIds: Set<string>;
  // What a screen may cite; anything else is dropped from the screen rather
  // than failing a long run.
  useCaseCodes: Set<string>;
  sourceCodes: Set<string>;
}

// Adds one batch's screens to those already drawn. Every screen belongs to one
// view of the navigation tree; one for a view that is not in this batch is
// either a repeat (dropped) or invented (the batch is refused).
export function mergeUiBatch(
  accumulated: Screen[],
  output: UiBatchOutput,
  targets: NavNode[],
  options: MergeOptions,
): Screen[] {
  const screens = accumulated.map((screen) => ({ ...screen }));
  const taken = new Set(screens.map((screen) => screen.localId));
  const inBatch = new Set(targets.map((node) => node.localId));
  for (const screen of output.screens) {
    const node = screen.navigationNodeLocalId;
    if (!node) invalid('Una pantalla no indica el nodo de navegación al que pertenece.');
    if (!inBatch.has(node!)) {
      if (options.knownNodeIds.has(node!)) continue;
      invalid('Una pantalla pertenece a un nodo de navegación que no es de este lote.');
    }
    let localId = screen.localId;
    for (let n = 2; taken.has(localId); n += 1) localId = `${screen.localId}-${n}`;
    taken.add(localId);
    screens.push({
      ...screen,
      localId,
      relatedUseCaseCodes: screen.relatedUseCaseCodes.filter((code) =>
        options.useCaseCodes.has(code),
      ),
      ...(screen.relatedSourceCodes
        ? {
            relatedSourceCodes: screen.relatedSourceCodes.filter((code) =>
              options.sourceCodes.has(code),
            ),
          }
        : {}),
    });
  }
  return screens;
}

export function nodesWithoutScreen(accumulated: Screen[], targets: NavNode[]) {
  const done = new Set(accumulated.map((screen) => screen.navigationNodeLocalId));
  return targets.filter((node) => !done.has(node.localId));
}

// Last resort for a view the model never drew a screen for: a plain screen
// from the navigation tree itself, which has the view's name, what it is for
// and the use cases that go through it.
export function fillMissingScreens(accumulated: Screen[], missing: NavNode[]): Screen[] {
  const taken = new Set(accumulated.map((screen) => screen.localId));
  const screens = [...accumulated];
  for (const node of missing) {
    let localId = `screen-${node.localId}`;
    for (let n = 2; taken.has(localId); n += 1) localId = `${localId}-${n}`;
    taken.add(localId);
    screens.push({
      localId,
      name: node.viewName,
      purpose: node.description ?? `Pantalla «${node.label}».`,
      targetActors: [],
      relatedUseCaseCodes: node.relatedUseCaseCodes,
      relatedSourceCodes: node.relatedSourceCodes,
      navigationNodeLocalId: node.localId,
      sections: [],
      primaryActions: [],
      secondaryActions: [],
      principalData: [],
      forms: [],
      states: [],
    });
  }
  return screens;
}

export function finishUiBlueprint(screens: Screen[]): UiBlueprintContent {
  const checked = uiBlueprintContentSchema.safeParse({ screens });
  if (!checked.success) return invalid('El plano reunido contiene pantallas inválidas.');
  return checked.data;
}
