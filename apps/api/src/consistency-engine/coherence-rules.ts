import {
  classDiagramContentSchema,
  classDiagramCoverageGaps,
  conceptualDomainModelContentSchema,
  implementationPlanContentSchema,
  navigationTreeContentSchema,
  uiBlueprintContentSchema,
  type ClassDiagramContent,
  type CoherenceChain,
  type NavigationTreeContent,
  type StructuredAnalysisKind,
  type UiBlueprintContent,
} from '@caseflow-ai/contracts';

// Coverage rules between planning stages (DEC-121, ADR-006). What one stage
// defines must appear in the next one, and what appears below must come from
// above. Pure functions: the same rules run when the AI generates (with the
// selected sources), when a person approves, when the design is frozen (with
// the current approved artifacts) and in the coherence matrix.

export interface CoherenceUpstream {
  dataModelEntities?: { name: string; attributes: { name: string }[] }[];
  classes?: ClassDiagramContent['classes'];
  navigationNodes?: NavigationTreeContent['nodes'];
  screens?: UiBlueprintContent['screens'];
  useCaseCodes?: string[];
}

// An upstream artifact as the rules read it: generation sources and approved
// versions are both turned into this shape.
export interface CoherenceSource {
  code: string;
  type: string;
  content?: unknown;
}

export function upstreamFromSources(sources: CoherenceSource[]): CoherenceUpstream {
  const of = (type: string) => sources.filter((source) => source.type === type);
  // undefined (not []) when no artifact of the type is present: nothing to cover.
  const collect = <T>(type: string, read: (content: unknown) => T[]) =>
    of(type).length ? of(type).flatMap((source) => read(source.content)) : undefined;
  return {
    dataModelEntities: collect(
      'DATA_MODEL',
      (c) => (c as { entities?: CoherenceUpstream['dataModelEntities'] })?.entities ?? [],
    ),
    classes: collect('CLASS_DIAGRAM', (c) => {
      const parsed = classDiagramContentSchema.safeParse(c);
      return parsed.success ? parsed.data.classes : [];
    }),
    navigationNodes: collect('NAVIGATION_TREE', (c) => {
      const parsed = navigationTreeContentSchema.safeParse(c);
      return parsed.success ? parsed.data.nodes : [];
    }),
    screens: collect('UI_BLUEPRINT', (c) => {
      const parsed = uiBlueprintContentSchema.safeParse(c);
      return parsed.success ? parsed.data.screens : [];
    }),
    useCaseCodes: of('USE_CASE').length ? of('USE_CASE').map((source) => source.code) : undefined,
  };
}

export interface CoherenceGap {
  chain: CoherenceChain;
  message: string;
}

// The kinds whose approval these rules gate.
export const COHERENCE_KINDS = new Set<StructuredAnalysisKind>([
  'CLASS_DIAGRAM',
  'CONCEPTUAL_DOMAIN_MODEL',
  'UI_BLUEPRINT',
  'IMPLEMENTATION_PLAN',
]);

// Persisted domain classes; value objects, enumerations and abstract classes
// live inside them.
const entityClasses = (classes: ClassDiagramContent['classes']) =>
  classes.filter((cls) => cls.stereotype === 'ENTITY');
// Sections only group views; every other node is something the user opens.
const viewNodes = (nodes: NavigationTreeContent['nodes']) =>
  nodes.filter((node) => node.kind !== 'SECTION');

export function coherenceGaps(
  kind: StructuredAnalysisKind,
  content: unknown,
  upstream: CoherenceUpstream,
): CoherenceGap[] {
  const gaps: CoherenceGap[] = [];
  const gap = (chain: CoherenceChain, message: string) => gaps.push({ chain, message });

  // A downstream element that names a class must name one that exists, and
  // every persisted class needs exactly that downstream element.
  const checkClassCoverage = (
    items: { name: string; classLocalId?: string }[],
    noun: string,
    stage: { in: string; of: string },
  ) => {
    if (!upstream.classes) return;
    const classIds = new Set(upstream.classes.map((cls) => cls.localId));
    for (const cls of entityClasses(upstream.classes))
      if (!items.some((item) => item.classLocalId === cls.localId))
        gap('ENTITY_CLASS_PLAN', `La clase «${cls.name}» no tiene ${noun} en ${stage.in}.`);
    for (const item of items)
      if (!item.classLocalId)
        gap(
          'ENTITY_CLASS_PLAN',
          `La entidad «${item.name}» ${stage.of} no indica qué clase del diagrama representa.`,
        );
      else if (!classIds.has(item.classLocalId))
        gap(
          'ENTITY_CLASS_PLAN',
          `La entidad «${item.name}» ${stage.of} representa la clase «${item.classLocalId}», que no existe en el diagrama de clases.`,
        );
  };

  if (kind === 'CLASS_DIAGRAM') {
    if (upstream.dataModelEntities)
      for (const message of classDiagramCoverageGaps(
        classDiagramContentSchema.parse(content),
        upstream.dataModelEntities,
      ))
        gap('ENTITY_CLASS_PLAN', message);
  } else if (kind === 'CONCEPTUAL_DOMAIN_MODEL') {
    const model = conceptualDomainModelContentSchema.parse(content);
    checkClassCoverage(model.entities, 'una entidad', {
      in: 'el modelo conceptual',
      of: 'del modelo conceptual',
    });
  } else if (kind === 'UI_BLUEPRINT') {
    const blueprint = uiBlueprintContentSchema.parse(content);
    if (upstream.navigationNodes) {
      const nodeIds = new Set(upstream.navigationNodes.map((node) => node.localId));
      for (const node of viewNodes(upstream.navigationNodes))
        if (!blueprint.screens.some((screen) => screen.navigationNodeLocalId === node.localId))
          gap(
            'NAVIGATION_SCREEN_ROUTE',
            `El nodo de navegación «${node.label}» no tiene una pantalla en el plano de interfaz.`,
          );
      for (const screen of blueprint.screens)
        if (!screen.navigationNodeLocalId)
          gap(
            'NAVIGATION_SCREEN_ROUTE',
            `La pantalla «${screen.name}» no indica a qué nodo de navegación corresponde.`,
          );
        else if (!nodeIds.has(screen.navigationNodeLocalId))
          gap(
            'NAVIGATION_SCREEN_ROUTE',
            `La pantalla «${screen.name}» corresponde al nodo «${screen.navigationNodeLocalId}», que no existe en la navegación.`,
          );
    }
    for (const code of upstream.useCaseCodes ?? [])
      if (!blueprint.screens.some((screen) => screen.relatedUseCaseCodes.includes(code)))
        gap(
          'REQUIREMENT_USE_CASE_SCREEN',
          `El caso de uso ${code} no aparece en ninguna pantalla del plano de interfaz.`,
        );
  } else if (kind === 'IMPLEMENTATION_PLAN') {
    const plan = implementationPlanContentSchema.parse(content);
    checkClassCoverage(plan.entities, 'una entidad persistente', {
      in: 'el plan de implementación',
      of: 'del plan de implementación',
    });
    if (upstream.screens) {
      const screenIds = new Set(upstream.screens.map((screen) => screen.localId));
      for (const screen of upstream.screens) {
        const routes = plan.routes.filter((route) => route.screenLocalId === screen.localId);
        if (!routes.length) {
          gap(
            'NAVIGATION_SCREEN_ROUTE',
            `La pantalla «${screen.name}» no tiene una ruta en el plan de implementación.`,
          );
          continue;
        }
        const served = new Set(routes.flatMap((route) => route.actions.map((a) => a.label)));
        for (const action of screen.primaryActions)
          if (!served.has(action))
            gap(
              'ACTION_ENDPOINT',
              `La acción «${action}» de la pantalla «${screen.name}» no tiene una operación ni un endpoint que la atienda.`,
            );
      }
      for (const route of plan.routes)
        if (!route.screenLocalId)
          gap(
            'NAVIGATION_SCREEN_ROUTE',
            `La ruta ${route.path} no indica qué pantalla del plano de interfaz muestra.`,
          );
        else if (!screenIds.has(route.screenLocalId))
          gap(
            'NAVIGATION_SCREEN_ROUTE',
            `La ruta ${route.path} muestra la pantalla «${route.screenLocalId}», que no existe en el plano de interfaz.`,
          );
        else {
          const screen = upstream.screens.find((s) => s.localId === route.screenLocalId)!;
          const actions = new Set([...screen.primaryActions, ...screen.secondaryActions]);
          for (const action of route.actions)
            if (!actions.has(action.label))
              gap(
                'ACTION_ENDPOINT',
                `La ruta ${route.path} atiende la acción «${action.label}», que la pantalla «${screen.name}» no tiene.`,
              );
        }
    }
    const servedEndpoints = new Set(
      plan.routes.flatMap((route) =>
        route.actions.flatMap((a) => (a.endpoint ? [a.endpoint] : [])),
      ),
    );
    for (const endpoint of plan.customEndpoints) {
      const key = `${endpoint.method} ${endpoint.path}`;
      if (!servedEndpoints.has(key))
        gap('ACTION_ENDPOINT', `El endpoint ${key} no atiende ninguna acción de pantalla.`);
    }
  }
  return gaps;
}

// What the AI is told it must cover, from the same upstream data the rules
// check afterwards (ADR-006: "la IA recibe la lista explícita").
export function coherenceChecklist(
  kind: StructuredAnalysisKind,
  upstream: CoherenceUpstream,
): string[] {
  const classItems = (target: string) =>
    entityClasses(upstream.classes ?? []).map(
      (cls) => `${target} con classLocalId «${cls.localId}» para la clase «${cls.name}».`,
    );
  switch (kind) {
    case 'CLASS_DIAGRAM':
      return (upstream.dataModelEntities ?? []).map(
        (entity) =>
          `Una clase con dataModelEntityName «${entity.name}» y los atributos ${entity.attributes
            .map((attribute) => `«${attribute.name}»`)
            .join(', ')}.`,
      );
    case 'CONCEPTUAL_DOMAIN_MODEL':
      return classItems('Una entidad');
    case 'UI_BLUEPRINT':
      return [
        ...viewNodes(upstream.navigationNodes ?? []).map(
          (node) =>
            `Una pantalla con navigationNodeLocalId «${node.localId}» para el nodo «${node.label}».`,
        ),
        ...(upstream.useCaseCodes ?? []).map(
          (code) => `Al menos una pantalla con ${code} en relatedUseCaseCodes.`,
        ),
      ];
    case 'IMPLEMENTATION_PLAN':
      return [
        ...classItems('Una entidad persistente'),
        ...(upstream.screens ?? []).map(
          (screen) =>
            `Una ruta con screenLocalId «${screen.localId}» para la pantalla «${screen.name}»${
              screen.primaryActions.length
                ? `, con estas acciones en actions: ${screen.primaryActions
                    .map((action) => `«${action}»`)
                    .join(', ')}`
                : ''
            }.`,
        ),
      ];
    default:
      return [];
  }
}
