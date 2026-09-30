import {
  conceptualDomainModelContentSchema,
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
): GenerationQualityFinding[] {
  const findings: GenerationQualityFinding[] = [];
  const allowed = new Set(sources.map((source) => source.code));
  const useCaseCodes = new Set(
    sources.filter((source) => source.type === 'USE_CASE').map((source) => source.code),
  );
  const referenced = new Set<string>();

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
  } else if (kind === 'CONCEPTUAL_DOMAIN_MODEL') {
    const parsed = conceptualDomainModelContentSchema.parse(content);
    for (const entity of parsed.entities)
      checkReferences(`La entidad «${entity.name}»`, entity.relatedSourceCodes ?? []);
  } else if (kind === 'IMPLEMENTATION_PLAN') {
    const parsed = implementationPlanContentSchema.parse(content);
    for (const module of parsed.modules)
      checkReferences(`El módulo ${module.name}`, module.relatedSourceCodes ?? []);
    for (const entity of parsed.entities)
      checkReferences(`La entidad ${entity.name}`, entity.relatedSourceCodes ?? []);
    for (const endpoint of parsed.customEndpoints)
      checkReferences(
        `El endpoint ${endpoint.method} ${endpoint.path}`,
        endpoint.relatedSourceCodes ?? [],
      );
    for (const route of parsed.routes)
      checkReferences(`La ruta ${route.path}`, route.relatedSourceCodes ?? []);
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
