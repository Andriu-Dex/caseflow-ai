import {
  classDiagramContentSchema,
  classDiagramCoverageGaps,
  conceptualDomainModelContentSchema,
  designThemeContentSchema,
  designThemeContrastIssues,
  generationPlanContentSchema,
  implementationPlanContentSchema,
  navigationTreeContentSchema,
  softwareArchitectureContentSchema,
  systemArchitectureContentSchema,
  uiBlueprintContentSchema,
  type StructuredAnalysisKind,
} from '@caseflow-ai/contracts';

export interface GenerationSourceReference {
  code: string;
  type: string;
  content?: unknown;
}

export interface GenerationQualityFinding {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
}

// These checks establish structural provenance, not factual truth. A human
// must still compare the proposed content with the underlying approved sources.
export function evaluateStructuredGeneration(
  kind: StructuredAnalysisKind,
  content: unknown,
  sources: GenerationSourceReference[],
  // DEC-121: in projects with mandatory coherence, coverage gaps are errors.
  options: { strict?: boolean } = {},
): GenerationQualityFinding[] {
  // A theme cites no sources; its review concern is accessibility. Low
  // contrast is a warning here (the candidate can still be fixed after
  // accepting it) and blocks approval later.
  if (kind === 'DESIGN_THEME')
    return designThemeContrastIssues(designThemeContentSchema.parse(content)).map((issue) => ({
      severity: 'WARNING',
      code: 'LOW_CONTRAST',
      message: issue.message,
    }));
  const findings: GenerationQualityFinding[] = [];
  const allowed = new Set(sources.map((source) => source.code));
  const useCaseCodes = new Set(
    sources.filter((source) => source.type === 'USE_CASE').map((source) => source.code),
  );
  const referenced = new Set<string>();
  // DEC-121: elements of the selected upstream artifacts, referenced by localId.
  const sourceItems = <T>(type: string, read: (content: unknown) => T[]) =>
    sources.filter((source) => source.type === type).flatMap((source) => read(source.content));
  const classes = sourceItems('CLASS_DIAGRAM', (c) => {
    const parsed = classDiagramContentSchema.safeParse(c);
    return parsed.success ? parsed.data.classes : [];
  });
  const screens = sourceItems('UI_BLUEPRINT', (c) => {
    const parsed = uiBlueprintContentSchema.safeParse(c);
    return parsed.success ? parsed.data.screens : [];
  });
  const checkClass = (label: string, classLocalId: string | undefined) => {
    if (classLocalId && !classes.some((cls) => cls.localId === classLocalId))
      findings.push({
        severity: 'ERROR',
        code: 'UNKNOWN_CLASS',
        message: `${label} representa la clase «${classLocalId}», que no está en el diagrama de clases seleccionado.`,
      });
  };

  const checkReferences = (label: string, codes: string[]) => {
    if (codes.length === 0) {
      findings.push({
        severity: 'WARNING',
        code: 'MISSING_PROVENANCE',
        message: `${label} no cita ninguna de las fuentes seleccionadas.`,
      });
    }
    for (const code of codes) {
      if (!allowed.has(code)) {
        findings.push({
          severity: 'ERROR',
          code: 'UNKNOWN_SOURCE',
          message: `${label} cita ${code}, que no pertenece a las fuentes seleccionadas.`,
        });
      } else {
        referenced.add(code);
      }
    }
  };
  const checkUseCases = (label: string, codes: string[], sourceCodes: string[]) => {
    for (const code of codes) {
      if (!useCaseCodes.has(code)) {
        findings.push({
          severity: 'ERROR',
          code: 'UNKNOWN_USE_CASE',
          message: `${label} cita el caso de uso ${code}, que no fue seleccionado.`,
        });
      } else if (!sourceCodes.includes(code)) {
        findings.push({
          severity: 'WARNING',
          code: 'MISSING_USE_CASE_PROVENANCE',
          message: `${label} relaciona ${code}, pero no lo incluye entre sus fuentes justificativas.`,
        });
      }
    }
  };

  if (kind === 'NAVIGATION_TREE') {
    const parsed = navigationTreeContentSchema.parse(content);
    for (const node of parsed.nodes) {
      checkReferences(`El nodo «${node.label}»`, node.relatedSourceCodes ?? []);
      checkUseCases(
        `El nodo «${node.label}»`,
        node.relatedUseCaseCodes,
        node.relatedSourceCodes ?? [],
      );
    }
  } else if (kind === 'SOFTWARE_ARCHITECTURE') {
    const parsed = softwareArchitectureContentSchema.parse(content);
    for (const component of parsed.components)
      checkReferences(`El componente «${component.name}»`, component.relatedSourceCodes ?? []);
  } else if (kind === 'SYSTEM_ARCHITECTURE') {
    const parsed = systemArchitectureContentSchema.parse(content);
    for (const node of parsed.nodes)
      checkReferences(`El nodo «${node.name}»`, node.relatedSourceCodes ?? []);
  } else if (kind === 'GENERATION_PLAN') {
    const parsed = generationPlanContentSchema.parse(content);
    const requirementCodes = new Set(
      sources.filter((source) => source.type === 'REQUIREMENT').map((source) => source.code),
    );
    for (const module of parsed.modules) {
      const label = `El módulo «${module.name}»`;
      checkReferences(label, module.relatedSourceCodes ?? []);
      checkUseCases(label, module.relatedUseCaseCodes, module.relatedSourceCodes ?? []);
      for (const code of module.relatedRequirementCodes) {
        if (!requirementCodes.has(code))
          findings.push({
            severity: 'ERROR',
            code: 'UNKNOWN_REQUIREMENT',
            message: `${label} cita el requisito ${code}, que no fue seleccionado.`,
          });
        else referenced.add(code);
      }
    }
    for (const workflow of parsed.workflows) {
      const label = `El flujo «${workflow.name}»`;
      checkReferences(label, workflow.relatedSourceCodes ?? []);
      checkUseCases(label, workflow.relatedUseCaseCodes, workflow.relatedSourceCodes ?? []);
    }
    for (const screen of parsed.screens)
      checkReferences(`La pantalla «${screen.name}»`, screen.relatedSourceCodes ?? []);
  } else if (kind === 'CLASS_DIAGRAM') {
    const parsed = classDiagramContentSchema.parse(content);
    for (const cls of parsed.classes)
      checkReferences(`La clase «${cls.name}»`, cls.relatedSourceCodes ?? []);
    const entities = sources
      .filter((source) => source.type === 'DATA_MODEL')
      .flatMap(
        (source) =>
          (source.content as { entities?: { name: string; attributes: { name: string }[] }[] })
            ?.entities ?? [],
      );
    for (const message of classDiagramCoverageGaps(parsed, entities))
      findings.push({
        severity: options.strict === false ? 'WARNING' : 'ERROR',
        code: 'COVERAGE_GAP',
        message,
      });
  } else if (kind === 'CONCEPTUAL_DOMAIN_MODEL') {
    const parsed = conceptualDomainModelContentSchema.parse(content);
    for (const entity of parsed.entities) {
      checkReferences(`La entidad «${entity.name}»`, entity.relatedSourceCodes ?? []);
      checkClass(`La entidad «${entity.name}»`, entity.classLocalId);
    }
  } else if (kind === 'IMPLEMENTATION_PLAN') {
    const parsed = implementationPlanContentSchema.parse(content);
    for (const module of parsed.modules)
      checkReferences(`El módulo ${module.name}`, module.relatedSourceCodes ?? []);
    for (const entity of parsed.entities) {
      checkReferences(`La entidad ${entity.name}`, entity.relatedSourceCodes ?? []);
      checkClass(`La entidad ${entity.name}`, entity.classLocalId);
    }
    for (const endpoint of parsed.customEndpoints)
      checkReferences(
        `El endpoint ${endpoint.method} ${endpoint.path}`,
        endpoint.relatedSourceCodes ?? [],
      );
    for (const route of parsed.routes) {
      checkReferences(`La ruta ${route.path}`, route.relatedSourceCodes ?? []);
      if (!route.screenLocalId) continue;
      const screen = screens.find((s) => s.localId === route.screenLocalId);
      if (!screen) {
        findings.push({
          severity: 'ERROR',
          code: 'UNKNOWN_SCREEN',
          message: `La ruta ${route.path} muestra la pantalla «${route.screenLocalId}», que no está en el plano de interfaz seleccionado.`,
        });
        continue;
      }
      const screenActions = new Set([...screen.primaryActions, ...screen.secondaryActions]);
      for (const action of route.actions)
        if (!screenActions.has(action.label))
          findings.push({
            severity: 'ERROR',
            code: 'UNKNOWN_SCREEN_ACTION',
            message: `La ruta ${route.path} atiende la acción «${action.label}», que la pantalla «${screen.name}» no tiene.`,
          });
    }
  } else if (kind === 'UI_BLUEPRINT') {
    const parsed = uiBlueprintContentSchema.parse(content);
    const navigationNodes = sources
      .filter((source) => source.type === 'NAVIGATION_TREE')
      .flatMap((source) => {
        const parsed = navigationTreeContentSchema.safeParse(source.content);
        return parsed.success ? parsed.data.nodes : [];
      });
    const navigationIds = new Set(navigationNodes.map((node) => node.localId));
    const usedNavigationIds = new Set<string>();
    for (const screen of parsed.screens) {
      checkReferences(`La pantalla «${screen.name}»`, screen.relatedSourceCodes ?? []);
      checkUseCases(
        `La pantalla «${screen.name}»`,
        screen.relatedUseCaseCodes,
        screen.relatedSourceCodes ?? [],
      );
      if (screen.navigationNodeLocalId) {
        if (!navigationIds.has(screen.navigationNodeLocalId)) {
          findings.push({
            severity: 'ERROR',
            code: 'UNKNOWN_NAVIGATION_NODE',
            message: `La pantalla «${screen.name}» cita un nodo de navegación no seleccionado.`,
          });
        } else {
          usedNavigationIds.add(screen.navigationNodeLocalId);
        }
      }
    }
    for (const node of navigationNodes) {
      if (node.kind !== 'SECTION' && !usedNavigationIds.has(node.localId))
        findings.push({
          severity: 'WARNING',
          code: 'UNCOVERED_NAVIGATION_NODE',
          message: `El nodo de navegación «${node.label}» no tiene una pantalla vinculada.`,
        });
    }
  }
  for (const source of sources) {
    if (!referenced.has(source.code))
      findings.push({
        severity: 'WARNING',
        code: 'UNCOVERED_SOURCE',
        message: `La fuente ${source.code} no está citada por ningún elemento de la propuesta.`,
      });
  }
  return findings;
}
