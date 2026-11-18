// DEC-175: the approved mockup screens joined by the navigation tree, so the
// design can be walked through before anything is built.

export type PrototypeNode = {
  localId: string;
  label: string;
  parentLocalId: string | null;
  depth: number;
  // The mockup screen this node shows; a section without one only groups.
  screen: {
    id: string;
    name: string;
    htmlUrl: string;
    purpose: string;
    actors: string[];
    actions: string[];
  } | null;
};

type TreeNode = { localId: string; label: string; parentLocalId?: string };
type BlueprintScreen = {
  localId: string;
  name: string;
  purpose: string;
  targetActors?: string[];
  navigationNodeLocalId?: string;
  primaryActions?: string[];
};
type MockupScreen = { id: string; screenLocalId: string; screenName: string; htmlUrl: string };

const OTHERS = '__others__';

// The tree in reading order (parents before their children), each node with
// its screen; mockup screens no node points to go under «Otras pantallas».
export function buildPrototype(
  tree: TreeNode[],
  blueprint: BlueprintScreen[],
  mockup: MockupScreen[],
): PrototypeNode[] {
  const shown = new Map(mockup.map((screen) => [screen.screenLocalId, screen]));
  const screenOf = (blueprintScreen: BlueprintScreen | undefined) => {
    const screen = blueprintScreen && shown.get(blueprintScreen.localId);
    return screen
      ? {
          id: screen.id,
          name: screen.screenName,
          htmlUrl: screen.htmlUrl,
          purpose: blueprintScreen.purpose,
          actors: blueprintScreen.targetActors ?? [],
          actions: blueprintScreen.primaryActions ?? [],
        }
      : null;
  };
  const byNode = new Map(
    blueprint.flatMap((screen) =>
      screen.navigationNodeLocalId ? [[screen.navigationNodeLocalId, screen] as const] : [],
    ),
  );
  const ids = new Set(tree.map((node) => node.localId));
  const children = new Map<string | null, TreeNode[]>();
  for (const node of tree) {
    const parent = node.parentLocalId && ids.has(node.parentLocalId) ? node.parentLocalId : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  const result: PrototypeNode[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const node of children.get(parent) ?? []) {
      result.push({
        localId: node.localId,
        label: node.label,
        parentLocalId: parent,
        depth,
        screen: screenOf(byNode.get(node.localId)),
      });
      walk(node.localId, depth + 1);
    }
  };
  walk(null, 0);
  const placed = new Set(result.flatMap((node) => (node.screen ? [node.screen.id] : [])));
  const loose = blueprint.filter((screen) => {
    const mockupScreen = shown.get(screen.localId);
    return mockupScreen && !placed.has(mockupScreen.id);
  });
  if (loose.length) {
    result.push({
      localId: OTHERS,
      label: 'Otras pantallas',
      parentLocalId: null,
      depth: 0,
      screen: null,
    });
    for (const screen of loose)
      result.push({
        localId: `${OTHERS}:${screen.localId}`,
        label: screen.name,
        parentLocalId: OTHERS,
        depth: 1,
        screen: screenOf(screen),
      });
  }
  return result;
}

// The nodes a role sees: its screens and the sections that lead to them.
export function forRole(nodes: PrototypeNode[], role: string | null): PrototypeNode[] {
  if (!role) return nodes;
  const keep = new Set<string>();
  const parentOf = new Map(nodes.map((node) => [node.localId, node.parentLocalId]));
  for (const node of nodes)
    if (node.screen && (!node.screen.actors.length || node.screen.actors.includes(role))) {
      let current: string | null = node.localId;
      while (current && !keep.has(current)) {
        keep.add(current);
        current = parentOf.get(current) ?? null;
      }
    }
  return nodes.filter((node) => keep.has(node.localId));
}

export const rolesOf = (nodes: PrototypeNode[]) =>
  [...new Set(nodes.flatMap((node) => node.screen?.actors ?? []))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
