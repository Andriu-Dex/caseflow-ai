import { createHash } from 'node:crypto';
import type {
  ConstructionUnit,
  GeneratedFileSummary,
  ImplementationPlanContent,
} from '@caseflow-ai/contracts';

type Plan = ImplementationPlanContent;
export interface UnitFile extends Pick<
  GeneratedFileSummary,
  'id' | 'path' | 'origin' | 'kind' | 'sha256'
> {
  planElements: string[];
  traces: { code: string; versionNumber: number }[];
}

const OPERATION_LABELS: Record<string, string> = {
  CREATE: 'crear',
  READ: 'consultar',
  GET: 'consultar',
  LIST: 'listar',
  UPDATE: 'modificar',
  DELETE: 'eliminar',
  ARCHIVE: 'archivar',
};
const ROUTE_KINDS: Record<string, string> = {
  LIST: 'listado',
  FORM: 'formulario',
  DETAIL: 'detalle',
  VIEW: 'vista',
  ACTION: 'operación',
};
const ORDER: Record<ConstructionUnit['kind'], number> = {
  SCREEN: 0,
  ACTION: 1,
  ENTITY: 2,
  MODULE: 3,
  PROJECT: 4,
};
const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;

// ADR-020: the generated code as construction units — screen, business
// action, entity, module and project base — each file in its most specific
// unit, with a deterministic summary of what the plan declares (no AI and no
// claim of functional correctness beyond validation).
export function constructionUnits(plan: Plan, files: UnitFile[]): ConstructionUnit[] {
  const units = new Map<string, ConstructionUnit>();
  const moduleName = (localId?: string) =>
    plan.modules.find((item) => item.localId === localId)?.name;
  const unit = (
    key: string,
    build: () => Pick<ConstructionUnit, 'kind' | 'title' | 'module' | 'summary'>,
  ) => {
    let found = units.get(key);
    if (!found) {
      found = {
        id: key,
        ...build(),
        contentSha256: '',
        files: [],
        origins: { TEMPLATE: 0, DETERMINISTIC: 0, AI_ASSISTED: 0, MANUAL: 0 },
        traces: [],
      };
      units.set(key, found);
    }
    return found;
  };
  const resolve = (element: string) => {
    const [kind, ...rest] = element.split(':');
    const value = rest.join(':');
    if (kind === 'route') {
      const route = plan.routes.find((item) => item.path === value);
      if (!route) return undefined;
      const entity = plan.entities.find((item) => item.localId === route.entityLocalId);
      const actions = route.actions.map((action) => action.label).filter(Boolean);
      return unit(element, () => ({
        kind: 'SCREEN',
        title: route.screenName ?? route.path,
        module: moduleName(entity?.moduleLocalId),
        summary: `Pantalla de tipo ${ROUTE_KINDS[route.kind] ?? route.kind.toLowerCase()} en ${route.path}${entity ? `, sobre la entidad ${entity.name}` : ''}.${actions.length ? ` Acciones: ${list(actions)}.` : ''}`,
      }));
    }
    if (kind === 'endpoint') {
      const endpoint = plan.customEndpoints.find((item) => `${item.method} ${item.path}` === value);
      if (!endpoint) return undefined;
      return unit(element, () => ({
        kind: 'ACTION',
        title: endpoint.summary ?? value,
        module: moduleName(endpoint.moduleLocalId),
        summary: `Acción de negocio ${value}${endpoint.roles?.length ? `, permitida a ${list(endpoint.roles)}` : ''}. ${endpoint.builtin ? 'La implementa una plantilla del sistema.' : 'Su contrato es fijo; su lógica de servidor la propone la IA y se valida en el sandbox.'}`,
      }));
    }
    if (kind === 'entity') {
      const entity = plan.entities.find((item) => item.localId === value);
      if (!entity) return undefined;
      const fields = entity.fields
        .filter((field) => !field.internal)
        .map((field) => field.label ?? field.name);
      const operations = entity.operations.map(
        (operation) => OPERATION_LABELS[operation] ?? operation.toLowerCase(),
      );
      return unit(element, () => ({
        kind: 'ENTITY',
        title: `Entidad ${entity.name}`,
        module: moduleName(entity.moduleLocalId),
        summary: `${entity.description ? `${entity.description.split('. ')[0]!.replace(/\.$/, '')}. ` : ''}Tiene ${fields.length} campos (${list(fields.slice(0, 6))}${fields.length > 6 ? '…' : ''})${operations.length ? ` que permite ${list(operations)}` : ''}. Incluye el modelo de datos, su contrato de validación, el servicio y la API.`,
      }));
    }
    if (kind === 'module') {
      const module = plan.modules.find((item) => item.localId === value);
      if (!module) return undefined;
      return unit(element, () => ({
        kind: 'MODULE',
        title: module.name,
        module: module.name,
        summary: module.description ?? `Módulo de negocio ${module.name}.`,
      }));
    }
    return undefined;
  };
  const priority = ['route:', 'endpoint:', 'entity:', 'module:'];
  for (const file of files) {
    let found: ConstructionUnit | undefined;
    for (const element of priority.flatMap((prefix) =>
      file.planElements.filter((item) => item.startsWith(prefix)),
    )) {
      found = resolve(element);
      if (found) break;
    }
    // Generation evidence (AI checkpoints, fidelity reports) is not code.
    if (!found && file.path.startsWith('docs/'))
      found = unit('evidence', () => ({
        kind: 'PROJECT',
        title: 'Evidencias de la generación',
        summary:
          'Puntos de control y reportes del proceso: composiciones y evaluaciones de pantallas, lógica de negocio propuesta, datos de demostración y fidelidad del diseño. No se ejecutan.',
      }));
    const target =
      found ??
      unit('project', () => ({
        kind: 'PROJECT',
        title: 'Base del proyecto',
        summary:
          'Estructura, configuración, dependencias, documentación y componentes comunes del proyecto generado.',
      }));
    target.files.push({
      id: file.id,
      path: file.path,
      origin: file.origin,
      kind: file.kind,
      sha256: file.sha256,
    });
    target.origins[file.origin] += 1;
    for (const trace of file.traces)
      if (
        !target.traces.some(
          (item) => item.code === trace.code && item.versionNumber === trace.versionNumber,
        )
      )
        target.traces.push(trace);
  }
  return [...units.values()]
    .map((item) => ({
      ...item,
      traces: item.traces.sort((a, b) => a.code.localeCompare(b.code)),
      contentSha256: createHash('sha256')
        .update(
          item.files
            .map((file) => `${file.path}\0${file.sha256}`)
            .sort()
            .join('\n'),
        )
        .digest('hex'),
    }))
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.title.localeCompare(b.title, 'es'));
}

type ScreenDesign = NonNullable<ConstructionUnit['design']>;
// The design record of each screen unit, read from the run's fidelity record
// (docs/design-fidelity.json). Observations are split by their codes.
export function screenDesigns(content: string | undefined): Map<string, ScreenDesign> {
  const designs = new Map<string, ScreenDesign>();
  if (!content) return designs;
  const records = (
    JSON.parse(content) as {
      records?: {
        routePath: string;
        presentation?: unknown;
        manualOverride?: unknown;
        observations?: string;
        acceptedException?: { justification: string };
      }[];
    }
  ).records;
  for (const record of records ?? [])
    designs.set(`route:${record.routePath}`, {
      source: record.manualOverride ? 'MANUAL' : record.presentation ? 'COMPOSED' : 'FUNCTIONAL',
      observations: [
        ...(record.observations ?? '').matchAll(
          /\b([A-Z]+(?:_[A-Z]+)+): ([\s\S]*?)(?=\s[A-Z]+(?:_[A-Z]+)+: |$)/g,
        ),
      ].map((match) => ({ code: match[1]!, description: match[2]!.trim() })),
      ...(record.acceptedException
        ? { acceptedJustification: record.acceptedException.justification }
        : {}),
    });
  return designs;
}
