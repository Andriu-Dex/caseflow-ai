import {
  DESIGN_THEME_TOKENS,
  type DesignThemeContent,
  type DesignThemePalette,
  type ImplementationPlanContent,
  type ActionValueDefinition,
} from '@caseflow-ai/contracts';
import { lowerFirst, pluralize, upperFirst } from '../naming';
import { customEndpointOperationId } from '../openapi.generator';
import { actionSchemaName } from './action-contract.templates';
import { actionFormFile } from './action-form.templates';
import { createSchemaName, inputRelations, manyInputRelations } from './contracts.templates';
import { findPrimaryDateField } from './backend.templates';
import {
  SCOPE,
  dependencies,
  file,
  json,
  type GeneratedProjectFile,
  type GenerationContext,
} from './types';

type Plan = ImplementationPlanContent;
type Entity = Plan['entities'][number];
type Field = Entity['fields'][number];
type Route = Plan['routes'][number];

// Next.js frontend following the CASEFLOW_STANDARD_WEB_V1 design profile:
// Tailwind + shadcn-style primitives, React Hook Form + Zod (the same
// contracts the API validates with), TanStack Query over the generated
// OpenAPI client — never hand-written fetch calls per screen (AGENTS.md §20).

const STANDARD_GLOBALS_CSS = `@import 'tailwindcss';

@theme {
  --color-background: oklch(0.99 0.002 265);
  --color-foreground: oklch(0.21 0.02 265);
  --color-muted: oklch(0.96 0.005 265);
  --color-muted-foreground: oklch(0.5 0.02 265);
  --color-primary: oklch(0.51 0.2 268);
  --color-primary-foreground: oklch(0.99 0 0);
  --color-destructive: oklch(0.58 0.22 27);
}

body {
  background: var(--color-background);
  color: var(--color-foreground);
}
`;

// "primaryForeground" -> "--color-primary-foreground: #ffffff;"
const cssVariables = (palette: DesignThemePalette, indent: string) =>
  DESIGN_THEME_TOKENS.map(
    (token) =>
      `${indent}--color-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${palette[token]};`,
  ).join('\n');

// DEC-118: the approved palette as Tailwind theme variables. With BOTH, the
// light palette is the default and `.dark` on <html> swaps every token.
function globalsCss(theme: DesignThemeContent | undefined): string {
  if (!theme) return STANDARD_GLOBALS_CSS;
  const base = theme.light ?? theme.dark!;
  return `@import 'tailwindcss';

@theme {
${cssVariables(base, '  ')}
}
${
  theme.mode === 'BOTH'
    ? `
.dark {
${cssVariables(theme.dark!, '  ')}
  color-scheme: dark;
}
`
    : ''
}
:root {
  color-scheme: ${theme.mode === 'DARK' ? 'dark' : 'light'};
}

*,
::before,
::after {
  border-color: var(--color-border);
}

body {
  background: var(--color-background);
  color: var(--color-foreground);
}
`;
}

const THEME_TOGGLE = `'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';

const STORAGE_KEY = 'theme';

// Light/dark switch: the saved choice wins, otherwise the system preference.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial = saved
      ? saved === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', initial);
    setDark(initial);
  }, []);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    setDark(next);
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggle}
      aria-label={dark ? 'Usar tema claro' : 'Usar tema oscuro'}
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </Button>
  );
}
`;

const THEME_TOGGLE_SPEC = `import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('switches to dark and remembers the choice', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar tema oscuro' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Usar tema claro' })).toBeTruthy();
  });
});
`;

const SPANISH_LABELS: Record<string, string> = {
  amount: 'Importe',
  applicationconditions: 'Condiciones de aplicación',
  validfrom: 'Válido desde',
  validuntil: 'Válido hasta',
  available: 'Disponible',
  product: 'Producto',
  branch: 'Sucursal',
  name: 'Nombre',
  identification: 'Identificación',
  address: 'Dirección',
  timezone: 'Zona horaria',
  status: 'Estado',
  category: 'Categoría',
  price: 'Precio',
  unit: 'Unidad de venta',
  quantity: 'Cantidad',
  date: 'Fecha',
  user: 'Usuario',
  role: 'Rol',
  email: 'Correo electrónico',
  password: 'Contraseña',
  description: 'Descripción',
  classification: 'Clasificación',
  notes: 'Notas',
  reason: 'Motivo',
  concept: 'Concepto',
  currency: 'Moneda',
  balance: 'Saldo',
  dailymenu: 'Menú diario',
  versionlabel: 'Versión',
  creationdate: 'Fecha de creación',
  publicationdate: 'Fecha de publicación',
  branchid: 'Sucursal',
  saledate: 'Fecha de venta',
  operationaldate: 'Fecha operativa',
  channel: 'Canal',
  totaldiscount: 'Descuento total',
  subtotal: 'Subtotal',
  total: 'Total',
  appliedamount: 'Importe aplicado',
  appliedat: 'Fecha de aplicación',
  authorizationevidence: 'Evidencia de autorización',
  historicalunitprice: 'Precio unitario histórico',
  unitprice: 'Precio unitario',
  discount: 'Descuento',
  componenttype: 'Tipo de componente',
  menuversioncomponent: 'Componente de versión de menú',
  menuversion: 'Versión de menú',
};

const labelOf = (name: string) => {
  const lower = name.toLowerCase();
  if (SPANISH_LABELS[lower]) return SPANISH_LABELS[lower];
  return upperFirst(name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase());
};

// "/orders/[orderId]" -> "app/orders/[orderId]/page.tsx"
export const pagePath = (routePath: string) =>
  routePath === '/' ? 'apps/web/app/page.tsx' : `apps/web/app${routePath}/page.tsx`;
// Relative path from a route page back to the apps/web root.
export const toWebRoot = (routePath: string) =>
  '../'.repeat(routePath.split('/').filter(Boolean).length + 1);
const dynamicParam = (routePath: string) => routePath.match(/\[([a-zA-Z0-9]+)\]/)?.[1];
// Every URL parameter of a route, in order: /sales/[saleId]/lines -> ["saleId"].
const routeParamNames = (routePath: string) =>
  [...routePath.matchAll(/\[([a-zA-Z0-9]+)\]/g)].map((m) => m[1]!);
// The URL parameter that identifies a record of this entity on the page, if
// any: [id], or [<name>Id] where <name> ends the entity name ([eventId] for
// CateringEvent).
const entityParam = (entity: Entity | undefined, names: string[]) =>
  entity
    ? names.find((name) => {
        const lower = name.toLowerCase();
        return (
          lower === 'id' ||
          (lower.endsWith('id') &&
            lower.length > 2 &&
            entity.name.toLowerCase().endsWith(lower.slice(0, -2)))
        );
      })
    : undefined;
// Reads the URL parameters a page body uses.
const paramsHook = (names: string[], body: string) => {
  const used = names.filter((name) => new RegExp(`\\b${name}\\b`).test(body));
  return used.length
    ? `\n  const { ${used.join(', ')} } = useParams<{ ${used.map((n) => `${n}: string`).join('; ')} }>();`
    : '';
};

function display(field: Field, accessor: string): string {
  switch (field.type) {
    case 'BOOLEAN':
      return `${accessor} ? 'Sí' : 'No'`;
    case 'DATE':
      return `${accessor} ? new Date(${accessor}).toLocaleDateString('es') : '—'`;
    case 'DATETIME':
      return `${accessor} ? new Date(${accessor}).toLocaleString('es', { timeZone: 'UTC' }) + ' UTC' : '—'`;
    default:
      return `${accessor} ?? '—'`;
  }
}

// ---- Screen actions (DEC-121) -------------------------------------------------
// Every action the plan lists for a route becomes a real control carrying
// data-action={"<label>"}; structural validation looks for that marker, so a
// planned action without a control keeps the project from READY.

type Action = Route['actions'][number];

export const actionMarker = (label: string) => `data-action={${JSON.stringify(label)}}`;

const pathParams = (path: string) => [...path.matchAll(/:([a-zA-Z0-9]+)/g)].map((m) => m[1]!);
const customEndpoint = (plan: Plan, action: Action) =>
  plan.customEndpoints.find((e) => `${e.method} ${e.path}` === action.endpoint);
const entityRoute = (plan: Plan, entity: Entity, kind: Route['kind']) =>
  plan.routes.find(
    (r) =>
      r.entityLocalId === entity.localId &&
      r.kind === kind &&
      (kind !== 'DETAIL' || Boolean(dynamicParam(r.path))),
  );

// Actions that need one record: they live on list rows and detail pages.
function isItemAction(plan: Plan, action: Action): boolean {
  if (action.operation) return ['GET', 'UPDATE', 'DELETE'].includes(action.operation);
  const endpoint = customEndpoint(plan, action);
  return Boolean(endpoint && pathParams(endpoint.path).length);
}

const text = (label: string) => `{${JSON.stringify(label)}}`;
const linkControl = (label: string, href: string) =>
  `<Link href=${href} ${actionMarker(label)}>
  <Button type="button" variant="outline">
    ${text(label)}
  </Button>
</Link>`;
const buttonControl = (label: string, run: string, onDone?: string, confirm?: string) =>
  `<ActionButton ${actionMarker(label)} run={${run}}${onDone ? ` onDone={${onDone}}` : ''}${
    confirm ? ` confirm=${text(confirm)}` : ''
  } />`;
const withId = (path: string, idExpr: string) =>
  `{\`${path.replace(/\[[a-zA-Z0-9]+\]/, `\${${idExpr}}`)}\`}`;

function routeHref(path: string, paramNames: string[], idExpr?: string): string {
  if (!path.includes('[')) return JSON.stringify(path);
  const expr = path.replace(/\[([a-zA-Z0-9]+)\]/g, (_, name: string) => {
    const matched = paramNames.find((p) => p.toLowerCase() === name.toLowerCase());
    if (matched) return `\${${matched}}`;
    if (idExpr) return `\${${idExpr}}`;
    return `\${${name}}`;
  });
  return `{\`${expr}\`}`;
}

interface ActionTarget {
  idExpr?: string;
  // The page's URL parameters ([saleId] -> "saleId"), each a variable in scope.
  routeParams?: string[];
  onDone?: string;
  onDelete?: string;
  isListPage?: boolean;
  hasDate?: boolean;
  refetch?: string;
}

// The control for one action, or null when this template cannot realise it
// here (structural validation then reports it).
function actionControl(
  plan: Plan,
  entity: Entity | undefined,
  action: Action,
  target: ActionTarget,
): string | null {
  const { label } = action;
  const { idExpr } = target;
  if (action.operation) {
    if (!entity || !entity.operations.includes(action.operation)) return null;
    const form = entityRoute(plan, entity, 'FORM');
    switch (action.operation) {
      case 'CREATE': {
        if (action.interaction?.startsWith('PAGINATE_')) return null;
        if (!form) return null;
        const formHref = form.path.replace(/\[[^\]]+\]/g, 'actual');
        return linkControl(label, `"${formHref}"`);
      }
      case 'LIST': {
        if (target.isListPage) {
          if (action.interaction === 'PAGINATE_NEXT')
            return `<Button type="button" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={!hasNextPage || query.isLoading} ${actionMarker(label)}>${text(label)}</Button>`;
          if (action.interaction === 'PAGINATE_PREVIOUS')
            return `<Button type="button" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || query.isLoading} ${actionMarker(label)}>${text(label)}</Button>`;
          if (action.interaction === 'QUERY' || action.interaction === 'REFETCH')
            return `<Button type="button" variant="outline" onClick={() => query.refetch()} disabled={query.isLoading${target.hasDate ? ' || isInvalidDateRange' : ''}} ${actionMarker(label)}>${text(label)}</Button>`;
          return `<Button type="button" variant="outline" onClick={() => query.refetch()} disabled={query.isLoading${target.hasDate ? ' || isInvalidDateRange' : ''}} ${actionMarker(label)}>${text(label)}</Button>`;
        }
        const list = entityRoute(plan, entity, 'LIST');
        // With no list screen, the query is run from here.
        return list
          ? linkControl(label, `"${list.path}"`)
          : buttonControl(label, `() => api.list${pluralize(entity.name)}()`, target.onDone);
      }
      case 'GET': {
        const detail = entityRoute(plan, entity, 'DETAIL');
        if (detail && idExpr) return linkControl(label, withId(detail.path, idExpr));
        // Without its detail screen, consulting runs the query from here; with
        // no record at hand it opens (or runs) the entity's list.
        if (idExpr)
          return buttonControl(label, `() => api.get${entity.name}(${idExpr})`, target.onDone);
        if (target.refetch)
          return `<Button type="button" variant="outline" ${actionMarker(label)} onClick={() => void ${target.refetch}()}>${text(label)}</Button>`;
        if (!entity.operations.includes('LIST')) return null;
        const list = entityRoute(plan, entity, 'LIST');
        return list
          ? linkControl(label, `"${list.path}"`)
          : buttonControl(label, `() => api.list${pluralize(entity.name)}()`, target.onDone);
      }
      case 'UPDATE':
        return form && idExpr && entity.operations.includes('GET')
          ? linkControl(label, `{\`${form.path}?id=\${${idExpr}}\`}`)
          : null;
      case 'DELETE':
        return idExpr
          ? buttonControl(
              label,
              `() => api.delete${entity.name}(${idExpr})`,
              target.onDelete,
              '¿Eliminar este registro?',
            )
          : null;
    }
  }
  const endpoint = customEndpoint(plan, action);
  if (!endpoint) return null;
  if (endpoint.disabledReason)
    return `<div><Button type="button" disabled ${actionMarker(label)}>{${JSON.stringify(label)}}</Button><p role="status">{${JSON.stringify(endpoint.disabledReason)}}</p></div>`;
  const params = pathParams(endpoint.path);
  // Each path parameter comes from the page's URL parameter of the same name
  // (case aside), or, when it is the only one, from the record at hand.
  const routeParams = target.routeParams ?? [];
  const values = params.map(
    (param) =>
      routeParams.find((name) => name.toLowerCase() === param.toLowerCase()) ??
      (params.length === 1 ? (idExpr ?? routeParams.at(-1)) : undefined),
  );
  if (values.some((value) => !value)) return null;
  if (endpoint.contract) {
    const id = customEndpointOperationId(endpoint);
    const references = new Set<string>();
    const collect = (value: ActionValueDefinition) => {
      if (value.referenceEntityLocalId) references.add(value.referenceEntityLocalId);
      for (const field of value.properties ?? []) collect(field.value);
      if (value.items) collect(value.items);
    };
    if (endpoint.contract.body) collect(endpoint.contract.body);
    if (endpoint.contract.query) collect(endpoint.contract.query);
    const loaders = [...references].map((localId) => {
      const entity = plan.entities.find((entity) => entity.localId === localId)!;
      const label = entity.fields.find(
        (field) => ['STRING', 'TEXT'].includes(field.type) && !field.internal,
      )?.name;
      return `${JSON.stringify(localId)}:async()=>(await api.list${pluralize(entity.name)}()).map(item=>({id:item.id,label:String(item.${label ?? 'id'})}))`;
    });
    const args = [
      ...(params.length === 1 && params[0] === 'id'
        ? [values[0]!]
        : params.length
          ? [`{ ${params.map((param, i) => `${param}: ${values[i]}`).join(', ')} }`]
          : []),
      ...(endpoint.contract.body ? [`${actionSchemaName(id, 'Body')}.parse(body)`] : []),
      ...(endpoint.contract.query ? [`${actionSchemaName(id, 'Query')}.parse(query)`] : []),
    ];
    const resultSlots =
      endpoint.contract.response.type === 'OBJECT'
        ? endpoint.contract.response
            .properties!.filter((field) => !field.value.technical)
            .map((field) => '<ActionResult field={' + JSON.stringify(field.name) + '} />')
            .join('')
        : '<ActionResult />';
    return `<ActionForm description={${JSON.stringify(endpoint.summary)}} label={${JSON.stringify(label)}} ${actionMarker(label)} actionKey={${JSON.stringify(endpoint.method + ' ' + endpoint.path)}} isMutation={${endpoint.method !== 'GET'}}${endpoint.contract.bindings ? ` bindings={${JSON.stringify(endpoint.contract.bindings)}}` : ''}${endpoint.contract.successNavigation ? ` successNavigation={${JSON.stringify(endpoint.contract.successNavigation)}}` : ''} ${endpoint.contract.body ? `bodyDefinition={${JSON.stringify(endpoint.contract.body)}}` : ''} ${endpoint.contract.query ? `queryDefinition={${JSON.stringify(endpoint.contract.query)}}` : ''} responseDefinition={${JSON.stringify(endpoint.contract.response)}}${loaders.length ? ` references={{${loaders.join(',')}}}` : ''} submit={async (body, query) => { void [body, query]; return api.${id}(${args.join(', ')}); }}${target.onDone ? ` onDone={${target.onDone}}` : ''}><ActionControls /><ActionFeedback />${resultSlots}</ActionForm>`;
  }
  const args = [
    ...(params.length === 1 && params[0] === 'id'
      ? [values[0]!]
      : params.length
        ? [`{ ${params.map((param, i) => `${param}: ${values[i]}`).join(', ')} }`]
        : []),
    ...(['POST', 'PATCH', 'PUT'].includes(endpoint.method) ? ['{}'] : []),
  ];
  return buttonControl(
    label,
    `() => api.${customEndpointOperationId(endpoint)}(${args.join(', ')})`,
    target.onDone,
    endpoint.builtin === 'ACCOUNT_DEACTIVATE'
      ? '¿Desea desactivar esta cuenta y cerrar sus sesiones?'
      : undefined,
  );
}

const controls = (
  plan: Plan,
  entity: Entity | undefined,
  actions: Action[],
  target: ActionTarget,
) =>
  actions
    .map((action) => actionControl(plan, entity, action, target))
    .filter((control): control is string => control !== null);

const indent = (block: string, spaces: number) =>
  block
    .split('\n')
    .map((line) => ' '.repeat(spaces) + line)
    .join('\n');

// Imports a page needs, read from the JSX it renders.
function pageImports(body: string, up: string, extra: string[] = []): string {
  if (body.includes('<ActionForm'))
    extra.push(
      `import { ActionForm, ActionControls, ActionFeedback, ActionResult } from '${up}components/action-form';`,
    );
  const actionSchemas = [
    ...new Set(
      [...body.matchAll(/\b([a-z][a-zA-Z0-9]*(?:Body|Query)Schema)\.parse\(/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  if (actionSchemas.length)
    extra.push(`import { ${actionSchemas.join(', ')} } from '@app/contracts';`);
  const lines = [
    body.includes('<Link') ? "import Link from 'next/link';" : '',
    ...extra,
    body.includes('<Button') ? `import { Button } from '${up}components/ui/button';` : '',
    body.includes('<Input') ? `import { Input } from '${up}components/ui/input';` : '',
    body.includes('<ActionButton')
      ? `import { ActionButton } from '${up}components/action-button';`
      : '',
  ];
  return [...new Set(lines.filter(Boolean))].join('\n');
}

function listPage(plan: Plan, entity: Entity, route: Route): string {
  const up = toWebRoot(route.path);
  const plural = pluralize(entity.name);
  const baseKey = `['${lowerFirst(plural)}']`;
  const detail = entity.operations.includes('GET')
    ? entityRoute(plan, entity, 'DETAIL')
    : undefined;
  const relColumns = inputRelations(entity).map((rel) => ({
    name: `${rel.name}Id`,
    type: 'STRING' as const,
    label: rel.name === 'dailyMenu' ? 'Fecha operativa del menú diario' : (rel.label ?? labelOf(rel.name)),
    required: false,
    unique: false,
    enumValues: [],
  }));
  const names = routeParamNames(route.path);
  const hook = paramsHook(names, names.join(' '));
  const primaryDate = findPrimaryDateField(entity, plan);
  const hasDate = Boolean(primaryDate);

  const columns = [...entity.fields, ...relColumns].slice(0, 8);
  const refresh = `() => queryClient.invalidateQueries({ queryKey: ${baseKey} })`;
  const pageActions = route.actions.filter(
    (a) =>
      !isItemAction(plan, a) &&
      a.interaction !== 'PAGINATE_NEXT' &&
      a.interaction !== 'PAGINATE_PREVIOUS',
  );
  const itemActions = route.actions.filter((a) => isItemAction(plan, a));
  const header = controls(plan, entity, pageActions, { isListPage: true, onDone: refresh, hasDate });
  const rowControls = controls(plan, entity, itemActions, {
    idExpr: 'row.id',
    onDone: refresh,
    onDelete: refresh,
  });
  const accessEditor = plan.routes.find(
    (item) => item.entityLocalId === entity.localId && item.builtinView === 'ACCOUNT_ACCESS',
  );
  if (accessEditor)
    rowControls.push(
      `<Link href=${withId(accessEditor.path, 'row.id')} className="text-primary underline">Roles y ámbitos de operación</Link>`,
    );
  const detailHref = detail ? withId(detail.path, 'row.id') : undefined;
  const idCell = detailHref
    ? `<td className="px-3 py-2 font-mono text-xs">\n  <Link className="text-primary underline" href=${detailHref}>\n    {row.id}\n  </Link>\n</td>`
    : `<td className="px-3 py-2 font-mono text-xs">{row.id}</td>`;
  const dataCells = columns.map((f, i) => {
    const expr =
      f.name === 'dailyMenuId'
        ? `((row as any).dailyMenu?.operationalDate ? new Date((row as any).dailyMenu.operationalDate).toLocaleDateString('es') : row.${f.name}) ?? '—'`
        : display(f, `row.${f.name}`);
    return i === 0 && detailHref
      ? `<td className="px-3 py-2">\n  <Link className="text-primary underline" href=${detailHref}>\n    {${expr}}\n  </Link>\n</td>`
      : `<td className="px-3 py-2">{${expr}}</td>`;
  });
  const cells = [idCell, ...dataCells];
  if (rowControls.length)
    cells.push(
      `<td className="px-3 py-2">\n  <div className="flex flex-wrap gap-2">\n${indent(rowControls.join('\n'), 4)}\n  </div>\n</td>`,
    );

  const body = `    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">${route.screenName.replace(/[<>{}]/g, '')}</h1>
${header.length ? `        <div className="flex flex-wrap gap-2">\n${indent(header.join('\n'), 10)}\n        </div>\n` : ''}      </div>
${names.map((n) => `      {${n} && <div className="text-xs text-muted-foreground"><span className="font-semibold">${text(labelOf(n.replace(/id$/i, '')))}:</span> {${n}}</div>}`).join('\n')}
      <div className="rounded border bg-card p-3 text-xs text-muted-foreground flex flex-col gap-1.5" role="status">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground">${text('Criterios de consulta y ámbito operativo:')}</span>
          <span className="font-mono text-[11px]">${text('Alcance verificado')}</span>
        </div>
        <p>${text('Consulta delimitada al ámbito autorizado y contexto operativo asignado al usuario. Registros auditados vinculados al ciclo operativo; las versiones conservadas se presentan de forma inalterable y sus componentes se examinan mediante las acciones de detalle correspondientes.')}</p>
      </div>${
        primaryDate
          ? `\n      <div className="flex flex-col gap-2 rounded border bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-foreground">${text(`Filtrar por ${primaryDate.label ?? labelOf(primaryDate.name)}:`)}</span>
          <div className="flex items-center gap-1.5">
            <label htmlFor="dateFrom" className="text-xs font-medium">${text('Desde:')}</label>
            <Input
              id="dateFrom"
              type="date"
              className="h-8 w-36 text-xs"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="dateTo" className="text-xs font-medium">${text('Hasta:')}</label>
            <Input
              id="dateTo"
              type="date"
              className="h-8 w-36 text-xs"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}>
              Limpiar
            </Button>
          )}
        </div>
        {isInvalidDateRange && (
          <p role="alert" className="text-xs font-medium text-destructive">
            El rango temporal es inválido: la fecha inicial («Desde») no puede ser posterior a la fecha final («Hasta»). Corrija las fechas antes de consultar.
          </p>
        )}
      </div>\n`
          : ''
      }      <PageState query={query} empty={${hasDate ? "isInvalidDateRange ? 'Rango temporal inválido: corrija las fechas de consulta.' : " : ''}page > 1 ? 'Fin de los registros. No hay más elementos en esta página.' : 'Aún no hay registros.'}>
        {(rows) => {
          const displayRows = rows;
          return (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">${text('Identificador')}</th>
${columns.map((f) => `                    <th className="px-3 py-2 font-medium">${text(f.label ?? labelOf(f.name))}</th>`).join('\n')}${rowControls.length ? `\n                    <th className="px-3 py-2 font-medium">${text('Acciones')}</th>` : ''}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => (
                    <tr key={row.id} className="border-t">
${indent(cells.join('\n'), 22)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </PageState>
      <div className="flex items-center justify-between border-t pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1 || query.isLoading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          ${actionMarker('Ir a la página anterior')}
        >
          Página anterior
        </Button>
        <span className="text-xs text-muted-foreground">Página {page}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasNextPage || query.isLoading}
          onClick={() => setPage((p) => p + 1)}
          ${actionMarker('Ir a la página siguiente')}
        >
          Página siguiente
        </Button>
      </div>
    </div>`;

  const usesClient = body.includes('queryClient');
  const extraImports = [
    "import { useState } from 'react';",
    `import { ${usesClient ? 'useQueryClient, ' : ''}useQuery } from '@tanstack/react-query';`,
    `import { api } from '${up}lib/api';`,
    `import { PageState } from '${up}components/page-state';`,
    hook ? "import { useParams } from 'next/navigation';" : '',
  ].filter(Boolean);

  return `'use client';

${pageImports(body, up, extraImports)}

export default function ${entity.name}ListPage() {
  const [page, setPage] = useState(1);${hasDate ? "\n  const [dateFrom, setDateFrom] = useState('');\n  const [dateTo, setDateTo] = useState('');\n  const isInvalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);" : ''}
  const limit = 20;
  const query = useQuery({
    queryKey: ['${lowerFirst(plural)}', page, limit${hasDate ? ', dateFrom, dateTo' : ''}],
    queryFn: () => api.list${plural}({ page, limit${hasDate ? ', from: dateFrom || undefined, to: dateTo || undefined' : ''} }),
    enabled: ${hasDate ? '!isInvalidDateRange' : 'true'},
  });
  const items = query.data ?? [];
  const nextPageQuery = useQuery({
    queryKey: ['${lowerFirst(plural)}', page + 1, limit${hasDate ? ', dateFrom, dateTo' : ''}],
    queryFn: () => api.list${plural}({ page: page + 1, limit${hasDate ? ', from: dateFrom || undefined, to: dateTo || undefined' : ''} }),
    enabled: ${hasDate ? '!isInvalidDateRange && ' : ''}items.length === limit,
  });
  const hasNextPage = items.length === limit && Boolean(nextPageQuery.data && nextPageQuery.data.length > 0);${usesClient ? '\n  const queryClient = useQueryClient();' : ''}${hook}
  return (
${body}
  );
}
`;
}

function detailPage(plan: Plan, entity: Entity, route: Route): string {
  const up = toWebRoot(route.path);
  const param = dynamicParam(route.path) ?? 'id';
  const list = entityRoute(plan, entity, 'LIST');
  const names = routeParamNames(route.path);
  const deletePushHref = list
    ? list.path.includes('[')
      ? '`' +
        list.path.replace(/\[([a-zA-Z0-9]+)\]/g, (_, name) => {
          const matched = names.find((p) => p.toLowerCase() === name.toLowerCase());
          return matched ? `\${${matched}}` : `\${${name}}`;
        }) +
        '`'
      : `'${list.path}'`
    : "'/'";
  // The page itself realises a GET action of its own entity.
  const own = route.actions.find((a) => a.operation === 'GET');
  const createAction = route.actions.find((a) => a.operation === 'CREATE');
  const others = route.actions.filter((a) => a !== own && a !== createAction);

  const parentRels = inputRelations(entity)
    .map((rel) => {
      const target = plan.entities.find((e) => e.localId === rel.targetEntityLocalId);
      const grand = target
        ? inputRelations(target)
            .map((r) => ({
              rel: r,
              target: plan.entities.find((e) => e.localId === r.targetEntityLocalId),
            }))
            .filter((g) => Boolean(g.target?.operations.includes('GET')))
        : [];
      return { rel, target, grand, canGet: Boolean(target?.operations.includes('GET')) };
    })
    .filter((p) => p.canGet);

  const childEntities = plan.entities
    .filter(
      (e) =>
        e.relations.some((r) => r.targetEntityLocalId === entity.localId) &&
        e.operations.includes('LIST'),
    )
    .map((child) => {
      const rel = child.relations.find((r) => r.targetEntityLocalId === entity.localId)!;
      const externalRels = inputRelations(child)
        .filter((r) => r.targetEntityLocalId !== entity.localId)
        .map((r) => ({
          rel: r,
          target: plan.entities.find((e) => e.localId === r.targetEntityLocalId),
        }))
        .filter((e) => Boolean(e.target?.operations.includes('LIST')));
      return { child, rel, externalRels };
    });

  const uniqueChildExternalRels = [
    ...new Map(
      childEntities
        .flatMap((c) => c.externalRels)
        .map((ext) => [ext.target!.name, ext]),
    ).values(),
  ];

  const hasSiblings = parentRels.length > 0 && entity.operations.includes('LIST');
  const firstParentRel = parentRels[0];
  const grandFirstRel = firstParentRel?.grand[0];
  const grandFirstQueryName =
    firstParentRel && grandFirstRel
      ? `${lowerFirst(firstParentRel.rel.name)}${upperFirst(grandFirstRel.rel.name)}Query`
      : undefined;

  const header = controls(plan, entity, others, {
    idExpr: param,
    onDone: '() => query.refetch()',
    onDelete: `() => router.push(${deletePushHref})`,
  });
  if (list) {
    const listHref = list.path.replace(/\[[^\]]+\]/g, 'actual');
    const entityPlural = pluralize(entity.name).toLowerCase();
    const resolvedListExpr = grandFirstQueryName
      ? `{${grandFirstQueryName}.data?.id ? \`/branches/\${${grandFirstQueryName}.data.id}/menus\` : '${listHref}'}`
      : `"${listHref}"`;
    header.push(
      `<Link href=${resolvedListExpr} ${actionMarker(route.screenName.toLowerCase().includes('versión') || route.screenName.toLowerCase().includes('version') ? 'Volver a la consulta de menús' : `Volver a la consulta de ${entityPlural}`)}><Button type="button" variant="outline">Volver a la consulta</Button></Link>`,
      `<Link href=${resolvedListExpr} ${actionMarker('Examinar otra versión conservada')}><Button type="button" variant="outline">Examinar otra versión</Button></Link>`,
    );
  }
  const relFields = inputRelations(entity).map((rel) => ({
    name: `${rel.name}Id`,
    label: rel.label ?? labelOf(rel.name),
  }));

  const parentQueriesCode = parentRels
    .map((p) => {
      const main = `  const ${lowerFirst(p.rel.name)}Query = useQuery({
    queryKey: ['${lowerFirst(p.target!.name)}', item?.${p.rel.name}Id],
    queryFn: () => api.get${p.target!.name}(item!.${p.rel.name}Id!),
    enabled: Boolean(item?.${p.rel.name}Id),
  });`;
      const grandQueries = p.grand
        .map(
          (g) => `  const ${lowerFirst(p.rel.name)}${upperFirst(g.rel.name)}Query = useQuery({
    queryKey: ['${lowerFirst(g.target!.name)}', ${lowerFirst(p.rel.name)}Query.data?.${g.rel.name}Id],
    queryFn: () => api.get${g.target!.name}(${lowerFirst(p.rel.name)}Query.data!.${g.rel.name}Id!),
    enabled: Boolean(${lowerFirst(p.rel.name)}Query.data?.${g.rel.name}Id),
  });`,
        )
        .join('\n');
      return grandQueries ? `${main}\n${grandQueries}` : main;
    })
    .join('\n');

  const childExtQueriesCode = uniqueChildExternalRels
    .map(
      (ext) =>
        `  const ${lowerFirst(pluralize(ext.target!.name))}Options = useQuery({
    queryKey: ['${lowerFirst(pluralize(ext.target!.name))}'],
    queryFn: async () => {
      let page = 1;
      const all: Array<Awaited<ReturnType<typeof api.list${pluralize(ext.target!.name)}>>[number]> = [];
      while (true) {
        const items = await api.list${pluralize(ext.target!.name)}({ page, limit: 100 });
        if (!items || items.length === 0) break;
        all.push(...items);
        if (items.length < 100) break;
        page++;
      }
      return all;
    },
  });`,
    )
    .join('\n');

  const childQueriesCode = [
    childExtQueriesCode,
    ...childEntities.map(
      (c) =>
        `  const ${lowerFirst(pluralize(c.child.name))}Query = useQuery({
    queryKey: ['${lowerFirst(pluralize(c.child.name))}', ${param}],
    queryFn: async () => {
      let page = 1;
      const all: Array<Awaited<ReturnType<typeof api.list${pluralize(c.child.name)}>>[number]> = [];
      while (true) {
        const items = await api.list${pluralize(c.child.name)}({ page, limit: 100 });
        if (!items || items.length === 0) break;
        const matching = items.filter((row) => String(row.${c.rel.name}Id) === String(${param}));
        all.push(...matching);
        if (items.length < 100) break;
        page++;
      }
      return all;
    },
    enabled: Boolean(item),
  });
  const ${lowerFirst(pluralize(c.child.name))} = ${lowerFirst(pluralize(c.child.name))}Query.data ?? [];`,
    ),
  ]
    .filter(Boolean)
    .join('\n');

  const siblingQueryCode = hasSiblings
    ? `  const sisterRecordsQuery = useQuery({
    queryKey: ['${lowerFirst(pluralize(entity.name))}', item?.${firstParentRel!.rel.name}Id],
    queryFn: async () => {
      let page = 1;
      const all: Array<Awaited<ReturnType<typeof api.list${pluralize(entity.name)}>>[number]> = [];
      while (true) {
        const items = await api.list${pluralize(entity.name)}({ page, limit: 100 });
        if (!items || items.length === 0) break;
        const matching = items.filter((r) => String(r.${firstParentRel!.rel.name}Id) === String(item?.${firstParentRel!.rel.name}Id) && String(r.id) !== String(${param}));
        all.push(...matching);
        if (items.length < 100) break;
        page++;
      }
      return all;
    },
    enabled: Boolean(item?.${firstParentRel!.rel.name}Id),
  });
  const sisterRecords = sisterRecordsQuery.data ?? [];`
    : '';

  const parentContextCards = parentRels
    .map((p) => {
      const grandDetails = p.grand
        .map((g) => {
          const qName = `${lowerFirst(p.rel.name)}${upperFirst(g.rel.name)}Query`;
          return `<div><span className="font-medium text-foreground">${text(labelOf(g.target!.name))}:</span> {${qName}.data ? (${qName}.data.name ?? ${qName}.data.identification ?? ${qName}.data.id) : (${lowerFirst(p.rel.name)}Query.data?.${g.rel.name}Id ?? '—')}</div>
            <div><span className="font-medium text-foreground">Identificación de ${text(labelOf(g.target!.name))}:</span> {${qName}.data?.identification ?? ${qName}.data?.id ?? '—'}</div>`;
        })
        .join('\n            ');
      return `      {${lowerFirst(p.rel.name)}Query.data && (
        <div className="rounded border bg-card p-3 text-xs flex flex-col gap-1.5" role="status">
          <span className="font-semibold text-foreground">${text(`Contexto de ${labelOf(p.target!.name)}:`)}</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
            ${p.target!.fields
              .slice(0, 4)
              .map(
                (f) =>
                  `<div><span className="font-medium text-foreground">${text(labelOf(f.name))}:</span> {String(${lowerFirst(p.rel.name)}Query.data.${f.name} ?? '—')}</div>`,
              )
              .join('\n            ')}
            ${grandDetails}
          </div>
        </div>
      )}`;
    })
    .join('\n');

  const childTablesCode = childEntities
    .map(
      (c) => `      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">${text(`${labelOf(c.child.name)}s vinculados`)}</h2>
          <span className="text-xs text-muted-foreground">{${lowerFirst(pluralize(c.child.name))}.length} elementos</span>
        </div>
        {${lowerFirst(pluralize(c.child.name))}Query.isLoading && (
          <p role="status" className="text-xs text-muted-foreground">Consultando registros y componentes vinculados…</p>
        )}
        {${lowerFirst(pluralize(c.child.name))}Query.isError && (
          <p role="alert" className="text-xs text-destructive">Error al consultar los registros vinculados en el servidor.</p>
        )}
        {!${lowerFirst(pluralize(c.child.name))}Query.isLoading && !${lowerFirst(pluralize(c.child.name))}Query.isError && ${lowerFirst(pluralize(c.child.name))}.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay registros vinculados para esta selección.</p>
        )}
        {!${lowerFirst(pluralize(c.child.name))}Query.isLoading && !${lowerFirst(pluralize(c.child.name))}Query.isError && ${lowerFirst(pluralize(c.child.name))}.length > 0 && (
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-2 py-1.5 font-medium">ID</th>
                  ${c.child.fields
                    .filter((f) => f.name !== 'id')
                    .map((f) => `<th className="px-2 py-1.5 font-medium">${text(f.label ?? labelOf(f.name))}</th>`)
                    .join('\n                  ')}
                  ${c.externalRels
                    .map(
                      (ext) =>
                        `<th className="px-2 py-1.5 font-medium">${text(labelOf(ext.target!.name))} (Identificador y denominación)</th>`,
                    )
                    .join('\n                  ')}
                </tr>
              </thead>
              <tbody>
                {${lowerFirst(pluralize(c.child.name))}.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-1.5 font-mono">{row.id}</td>
                    ${c.child.fields
                      .filter((f) => f.name !== 'id')
                      .map((f) => `<td className="px-2 py-1.5">{${display(f, `row.${f.name}`)}}</td>`)
                      .join('\n                    ')}
                    ${c.externalRels
                      .map((ext) => {
                        const optName = `${lowerFirst(pluralize(ext.target!.name))}Options`;
                        return `<td className="px-2 py-1.5">{(() => { const found = ${optName}.data?.find((o) => o.id === row.${ext.rel.name}Id); return found ? \`\${found.name ?? found.denomination ?? found.id} (\${row.${ext.rel.name}Id})\` : (row.${ext.rel.name}Id ?? '—'); })()}</td>`;
                      })
                      .join('\n                    ')}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>`,
    )
    .join('\n');

  const siblingCardsCode = hasSiblings
    ? `      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Otras versiones o registros disponibles del mismo contexto</h2>
          <span className="text-xs text-muted-foreground">{sisterRecords.length} alternativas</span>
        </div>
        {sisterRecordsQuery.isLoading && (
          <p role="status" className="text-xs text-muted-foreground">Consultando otras versiones conservadas del mismo contexto…</p>
        )}
        {sisterRecordsQuery.isError && (
          <p role="alert" className="text-xs text-destructive">Error al consultar las versiones alternativas en el servidor.</p>
        )}
        {!sisterRecordsQuery.isLoading && !sisterRecordsQuery.isError && sisterRecords.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay otras versiones conservadas para este registro.</p>
        )}
        {!sisterRecordsQuery.isLoading && !sisterRecordsQuery.isError && sisterRecords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sisterRecords.map((r) => (
              <Link key={r.id} href={\`${route.path.replace(/\/\[[^\]]+\]$/, '')}/\${r.id}\`} ${actionMarker('Examinar versión')}>
                <Button type="button" variant="outline" size="sm">
                  {String(r.versionLabel ?? r.name ?? r.id)}
                </Button>
              </Link>
            ))}
          </div>
        )}
      </div>`
    : '';

  const form = entityRoute(plan, entity, 'FORM');
  const createSectionCode = createAction
    ? `      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4" role="region">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">${text(createAction.label)}</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-secondary text-secondary-foreground">Estado inicial: BORRADOR</span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">Identificación correlativa atómica asignada por servidor</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Prepara una nueva versión en borrador conservando íntegras las versiones anteriores. La sucursal y la fecha operativa se heredan automáticamente en solo lectura del contexto actual.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground bg-card p-2.5 rounded border">
          <div><span className="font-medium text-foreground">Ámbito y contexto heredado:</span> {item?.${firstParentRel?.rel.name ?? 'dailyMenu'}Id ? \`Menú \${item.${firstParentRel?.rel.name ?? 'dailyMenu'}Id}\` : '—'}</div>
          <div><span className="font-medium text-foreground">Sucursal autorizada:</span> {${grandFirstQueryName ? `${grandFirstQueryName}.data?.name ?? ${grandFirstQueryName}.data?.identification ?? ` : ''}'Sucursal asignada'}</div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            disabled={isSubmitting || !item}
            ${actionMarker(createAction.label)}
            onClick={async () => {
              try {
                setIsSubmitting(true);
                const res = await api.create${entity.name}({
                  ${firstParentRel ? `${firstParentRel.rel.name}Id: item.${firstParentRel.rel.name}Id,` : ''}
                  ${entity.fields.some((f) => f.name === 'status') ? "status: 'BORRADOR'," : ''}
                } as unknown as Parameters<typeof api.create${entity.name}>[0]);
                toast.success('Nueva versión en borrador preparada correctamente: ' + (res.versionLabel ?? res.id) + ' (Estado: ' + (res.status ?? 'BORRADOR') + ')');
                router.push(\`${route.path.replace(/\/\[[^\]]+\]$/, '')}/\${res.id}/edit\`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Error al preparar la nueva versión.');
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            {isSubmitting ? 'Preparando borrador…' : ${JSON.stringify(createAction.label)}}
          </Button>
        </div>
      </div>`
    : '';

  const body = `    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold"${own ? ` ${actionMarker(own.label)}` : ''}>${route.screenName.replace(/[<>{}]/g, '')}</h1>
${header.length ? `        <div className="flex flex-wrap gap-2">\n${indent(header.join('\n'), 10)}\n        </div>\n` : ''}      </div>
      <div className="rounded border border-border bg-card p-3 text-xs text-muted-foreground" role="status">
        <span className="font-semibold">Detalle conservado: </span>
        Consulta en solo lectura. La preparación de nuevas propuestas y la gestión de componentes asociados se realizan mediante sus formularios específicos.
      </div>
${parentContextCards ? parentContextCards + '\n' : ''}      <PageState query={query}>
        {(item) => (
          <dl className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">${text('Identificador')}</dt>
              <dd className="font-mono text-xs">{item.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">${text('Responsable de creación')}</dt>
              <dd className="text-xs font-medium">{String(item.userId ?? 'Operador en sesión activa')}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">${text('Instante de registro UTC')}</dt>
              <dd className="text-xs font-mono">{item.createdAt ? new Date(item.createdAt).toLocaleString('es', { timeZone: 'UTC' }) + ' UTC' : '—'}</dd>
            </div>
${entity.fields
  .map(
    (f) =>
      `            <div>\n              <dt className="text-xs text-muted-foreground">${text(f.label ?? labelOf(f.name))}</dt>\n              <dd>{${display(f, `item.${f.name}`)}}</dd>\n            </div>`,
  )
  .join('\n')}
${relFields
  .map(
    (rf) =>
      `            <div>\n              <dt className="text-xs text-muted-foreground">${text(rf.label)}</dt>\n              <dd className="font-mono text-xs">{String(item.${rf.name} ?? '—')}</dd>\n            </div>`,
  )
  .join('\n')}
          </dl>
        )}
      </PageState>
${createSectionCode ? createSectionCode + '\n' : ''}${childTablesCode ? childTablesCode + '\n' : ''}${siblingCardsCode ? siblingCardsCode + '\n' : ''}    </div>`;

  const usesRouter = body.includes('router.') || Boolean(createAction);
  const usesState = body.includes('isSubmitting') || Boolean(createAction);
  const usesToast = body.includes('toast.') || Boolean(createAction);
  return `'use client';

${pageImports(body, up, [
  `import { ${usesRouter ? 'useRouter, ' : ''}useParams } from 'next/navigation';`,
  usesState ? "import { useState } from 'react';" : '',
  usesToast ? "import { toast } from 'sonner';" : '',
  "import { useQuery } from '@tanstack/react-query';",
  `import { api } from '${up}lib/api';`,
  `import { PageState } from '${up}components/page-state';`,
])}

export default function ${entity.name}DetailPage() {
  const { ${param} } = useParams<{ ${param}: string }>();${usesRouter ? '\n  const router = useRouter();' : ''}${usesState ? '\n  const [isSubmitting, setIsSubmitting] = useState(false);' : ''}
  const query = useQuery({
    queryKey: ['${lowerFirst(entity.name)}', ${param}],
    queryFn: () => api.get${entity.name}(${param}),
  });
  const item = query.data;
${parentQueriesCode ? parentQueriesCode + '\n' : ''}${childQueriesCode ? childQueriesCode + '\n' : ''}${siblingQueryCode ? siblingQueryCode + '\n' : ''}  return (
${body}
  );
}
`;
}

// Only the input primitives the form actually renders, so lint stays clean.
function inputImport(body: string, up: string): string {
  const names = [
    body.includes('<Input') ? 'Input' : '',
    body.includes('{input}') ? 'input' : '',
  ].filter(Boolean);
  return names.length ? `import { ${names.join(', ')} } from '${up}components/ui/input';` : '';
}

function formPage(plan: Plan, entity: Entity, route: Route, list: Route | undefined): string {
  const up = toWebRoot(route.path);
  const schema = createSchemaName(entity.name);
  // Editing reuses the form when the plan exposes reading and updating.
  const editable = entity.operations.includes('UPDATE') && entity.operations.includes('GET');
  // The submit button realises the form's own create/update action; other
  // create/update actions of the same form are further submit buttons.
  const own = route.actions.find((a) => a.operation === 'CREATE' || a.operation === 'UPDATE');
  const submits = route.actions.filter(
    (a) => a !== own && (a.operation === 'CREATE' || a.operation === 'UPDATE'),
  );
  const names = routeParamNames(route.path);
  const relationParams = inputRelations(entity)
    .map((relation) => {
      const param = names.find(
        (n) =>
          n.toLowerCase() === relation.name.toLowerCase() ||
          n.toLowerCase() === relation.name.toLowerCase() + 'id' ||
          (n.toLowerCase().endsWith('id') &&
            relation.name.toLowerCase().endsWith(n.toLowerCase().slice(0, -2))),
      );
      return { relation, param };
    })
    .filter(({ param }) => Boolean(param)) as {
    relation: (typeof entity.relations)[number];
    param: string;
  }[];
  const isRelationBound = relationParams.length > 0;
  const isConditionedRoute =
    isRelationBound &&
    (route.screenName.toLowerCase().includes('condicion') ||
      entity.name === 'BranchProductPrice');

  const header = controls(
    plan,
    entity,
    route.actions.filter((a) => a !== own && !submits.includes(a)),
    {
      idExpr: entityParam(entity, names),
      routeParams: names,
      refetch: editable || isRelationBound ? 'existing.refetch' : undefined,
    },
  );
  if (isRelationBound) {
    header.push(
      `<Button type="button" variant="outline" disabled={existing.isLoading} ${actionMarker('Reintentar consulta')} onClick={() => void existing.refetch()}>Reintentar consulta</Button>`,
    );
  }
  const fallbackList =
    list ??
    inputRelations(entity)
      .map((rel) =>
        plan.routes.find((r) => r.entityLocalId === rel.targetEntityLocalId && r.kind === 'LIST'),
      )
      .find(Boolean) ??
    plan.routes.find((r) => r.kind === 'LIST');
  const returnRoute = list ?? fallbackList;
  const relationTargets = inputRelations(entity)
    .map((relation) => ({
      relation,
      target: plan.entities.find((e) => e.localId === relation.targetEntityLocalId)!,
    }))
    .filter(({ target }) => target.operations.includes('LIST'));
  const isDescriptiveOnly = route.screenName.toLowerCase().includes('descriptiv');
  const detailRoute = entityRoute(plan, entity, 'DETAIL');
  const manyTargets = isDescriptiveOnly
    ? []
    : manyInputRelations(entity, plan)
        .map((relation) => ({
          relation,
          target: plan.entities.find((item) => item.localId === relation.targetEntityLocalId)!,
        }))
        .filter(({ target }) => target.operations.includes('LIST'));
  const isCreation = route.path.endsWith('/new') || own?.operation === 'CREATE';
  const isEdit = editable && !isCreation && own?.operation === 'UPDATE';
  const isPublishRoute =
    route.path.endsWith('/publish') || route.screenName.toLowerCase().includes('publica');
  const hasPublishedStatus = entity.fields.some(
    (f) => f.name === 'status' && f.enumValues.includes('PUBLICADA'),
  );
  const hasDraftStatus = entity.fields.some(
    (f) => f.name === 'status' && f.enumValues.includes('BORRADOR'),
  );
  const hasSiblingPublishRoute = plan.routes.some(
    (r) =>
      r !== route &&
      r.entityLocalId === entity.localId &&
      (r.path.endsWith('/publish') || r.screenName.toLowerCase().includes('publica')),
  );
  const isDraftCreation =
    isCreation &&
    hasDraftStatus &&
    (route.screenName.toLowerCase().includes('borrador') ||
      route.screenName.toLowerCase().includes('draft') ||
      Boolean(own?.label.toLowerCase().includes('borrador')) ||
      hasSiblingPublishRoute);
  const isDraftEdit =
    isEdit &&
    !isPublishRoute &&
    hasDraftStatus &&
    (route.screenName.toLowerCase().includes('borrador') ||
      route.screenName.toLowerCase().includes('draft') ||
      Boolean(own?.label.toLowerCase().includes('borrador')) ||
      hasSiblingPublishRoute);
  const isAccount = plan.authentication.local?.userEntityLocalId === entity.localId;
  const childEntities = plan.entities
    .filter(
      (e) =>
        e.relations.some((r) => r.targetEntityLocalId === entity.localId) &&
        e.operations.includes('LIST') &&
        (e.operations.includes('CREATE') || e.operations.includes('DELETE')),
    )
    .map((child) => {
      const rel = child.relations.find((r) => r.targetEntityLocalId === entity.localId)!;
      const externalRels = inputRelations(child)
        .filter((r) => r.targetEntityLocalId !== entity.localId)
        .map((r) => ({
          rel: r,
          target: plan.entities.find((e) => e.localId === r.targetEntityLocalId)!,
        }))
        .filter((e) => Boolean(e.target?.operations.includes('LIST')));
      return { child, rel, externalRels };
    });
  const primaryChild = childEntities.find((c) => c.child.name === 'MenuVersionComponent');
  const hasChildComponents =
    isEdit && !isPublishRoute && Boolean(primaryChild && primaryChild.externalRels.length > 0);
  const hasReadOnlyComponents = isPublishRoute && Boolean(primaryChild);
  const prodTargetName = primaryChild?.externalRels[0]?.target?.name ?? 'Product';
  const needsResolvedBranch =
    !names.some((p) => p.toLowerCase() === 'branchid') &&
    (Boolean(returnRoute?.path.toLowerCase().includes('[branchid]')) ||
      Boolean(list?.path.toLowerCase().includes('[branchid]')));
  const formFields = (isAccount
    ? [
        ...entity.fields,
        {
          name: 'password',
          type: 'STRING' as const,
          required: true,
          unique: false,
          enumValues: [],
        },
      ]
    : entity.fields
  ).filter((field) => {
    if (
      (isDraftCreation || isDraftEdit || isPublishRoute) &&
      (field.name.toLowerCase().includes('publication') ||
        field.name.toLowerCase().includes('publicacion'))
    ) {
      return false;
    }
    if (isPublishRoute && field.name === 'status') {
      return false;
    }
    return true;
  });
  const defaultStatus =
    (isDraftCreation || isDraftEdit) && hasDraftStatus
      ? 'BORRADOR'
      : undefined;
  const formDefaultValues = defaultStatus ? `, defaultValues: { status: '${defaultStatus}' }` : '';
  const inputs = formFields
    .filter((field) => !('readOnly' in field && field.readOnly))
    .map((field) => {
      const fieldLabelText =
        isAccount && field.name === 'password'
          ? 'Contraseña'
          : (field.label ?? labelOf(field.name));
      const label = `<label htmlFor="${field.name}" className="text-sm font-medium">${text(fieldLabelText)}${field.required ? ' *' : ' (opcional)'}</label>`;
      const empty = field.required ? '' : ", setValueAs: (v: string) => (v === '' ? undefined : v)";
      let control: string;
      switch (field.type) {
        case 'TEXT':
          control = `<textarea id="${field.name}" className={input} rows={4} {...register('${field.name}'${empty ? `, { ${empty.slice(2)} }` : ''})} />`;
          break;
        case 'INT':
          control = `<Input id="${field.name}" type="number" step="1" {...register('${field.name}', { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) })} />`;
          break;
        case 'BOOLEAN':
          control = isRelationBound
            ? `<select id="${field.name}" className={input} {...register('${field.name}', { setValueAs: (v: string) => (v === '' ? undefined : v === 'true') })}>
            <option value="">Seleccione una opción…</option>
            <option value="true">Sí (${labelOf(field.name)})</option>
            <option value="false">No (${labelOf(field.name)})</option>
          </select>`
            : `<input id="${field.name}" type="checkbox" className="size-4" {...register('${field.name}')} />`;
          break;
        case 'DATE':
          control = `<Input id="${field.name}" type="date" {...register('${field.name}'${empty ? `, { ${empty.slice(2)} }` : ''})} />`;
          break;
        case 'DATETIME':
          control = `<Input id="${field.name}" type="datetime-local" {...register('${field.name}', { setValueAs: (v: string) => (v ? new Date(v).toISOString() : undefined) })} />`;
          break;
        case 'ENUM': {
          if ((isDraftCreation || isDraftEdit) && field.name === 'status') {
            control = `<div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-secondary text-secondary-foreground font-mono">BORRADOR</span>
            <input type="hidden" value="BORRADOR" {...register('status')} />
            <span className="text-xs text-muted-foreground">${isDraftEdit ? 'Estado exclusivo de borrador (la publicación formal se realiza en la pantalla correspondiente)' : 'Estado inicial exclusivo de borrador'}</span>
          </div>`;
            break;
          }
          const isDraftDefault = defaultStatus && field.name === 'status';
          control = `<select id="${field.name}" className={input} ${isDraftDefault ? `defaultValue="${defaultStatus}" ` : ''}{...register('${field.name}'${empty ? `, { ${empty.slice(2)} }` : ''})}>
            ${field.required ? '' : '<option value="">—</option>\n            '}${field.enumValues.map((v) => `<option value="${v}">${labelOf(v.toLowerCase())}</option>`).join('\n            ')}
          </select>`;
          break;
        }
        default:
          control = `<Input id="${field.name}" ${field.type === 'DECIMAL' ? 'inputMode="decimal" ' : ''}{...register('${field.name}'${empty ? `, { ${empty.slice(2)} }` : ''})} />`;
      }
      if (isAccount && field.name === 'password')
        control = `<Input id="password" type="password" autoComplete="new-password" required={${editable ? '!editId' : 'true'}} {...register('password', { setValueAs: (value: string) => value || undefined })} />`;
      return `        <div className="flex flex-col gap-1">
          ${label}
          ${control}
          <FieldError message={errors.${field.name}?.message} />
        </div>`;
    });
  const relationInputs = inputRelations(entity).map((relation) => {
    const target = relationTargets.find((t) => t.relation.name === relation.name)?.target;
    const name = `${relation.name}Id`;
    const empty = relation.required
      ? ''
      : ", { setValueAs: (v: string) => (v === '' ? undefined : v) }";
    const relLabelText = relation.label ?? labelOf(relation.name);
    const displayProp = target?.fields.find(
      (f) =>
        f.name === 'name' ||
        f.name === 'denomination' ||
        f.name === 'title' ||
        f.name === 'operationalDate' ||
        f.name.toLowerCase().includes('date'),
    )?.name;
    const codeProp = target?.fields.find(
      (f) => f.name === 'identification' || f.name === 'code',
    )?.name;
    const helperNote =
      relation.name === 'dailyMenu'
        ? `<p className="text-xs text-muted-foreground">Menú diario seleccionado vinculado al ciclo operativo.</p>`
        : '';
    if (isEdit && relation.name === 'dailyMenu') {
      return `        <div className="flex flex-col gap-1">
          <label htmlFor="${name}" className="text-sm font-medium">${text(relLabelText)} (inmutable)</label>
          <div className="rounded border bg-muted/20 px-3 py-2 text-xs font-mono text-muted-foreground flex items-center justify-between">
            <span>{String(existing.data?.dailyMenu?.id ?? (existing.data as { dailyMenuId?: string })?.dailyMenuId ?? '—')}</span>
            {(existing.data as { dailyMenu?: { operationalDate?: string } })?.dailyMenu?.operationalDate && (
              <span className="font-sans text-[11px] text-muted-foreground">
                Fecha operativa: {new Date((existing.data as { dailyMenu?: { operationalDate?: string } }).dailyMenu!.operationalDate!).toLocaleDateString()}
              </span>
            )}
          </div>
          <input type="hidden" id="${name}" {...register('${name}'${empty})} />
          <p className="text-xs text-muted-foreground">El menú diario vinculado define la sucursal y la fecha operativa del ciclo comercial; es inmutable para esta versión.</p>
          <FieldError message={errors.${name}?.message} />
        </div>`;
    }
    return `        <div className="flex flex-col gap-1">
          <label htmlFor="${name}" className="text-sm font-medium">${text(relLabelText)}${relation.required ? ' *' : ' (opcional)'}</label>
          ${
            target
              ? `{${lowerFirst(relation.name)}Options.isLoading && <p role="status" className="text-xs text-muted-foreground">Cargando opciones…</p>}
          {${lowerFirst(relation.name)}Options.isError && <p role="alert" className="text-xs text-destructive">Error al cargar opciones.</p>}
          <select id="${name}" className={input} {...register('${name}'${empty})}>
            <option value="">Seleccione…</option>
            {${lowerFirst(relation.name)}Options.data?.map((option) => (
              <option key={option.id} value={option.id}>
                {String(option.id)}
                {option.${codeProp ?? 'id'} && option.${codeProp ?? 'id'} !== option.id ? \` - \${String(option.${codeProp ?? 'id'})}\` : ''}
                {option.${displayProp ?? 'id'} && option.${displayProp ?? 'id'} !== option.id ? \` (\${String(option.${displayProp ?? 'id'})})\` : ''}
              </option>
            ))}
          </select>
          ${helperNote}`
              : `<Input id="${name}" placeholder="Identificador" {...register('${name}'${empty})} />`
          }
          <FieldError message={errors.${name}?.message} />
        </div>`;
  });
  const optionQueries = relationTargets.map(
    ({ relation, target }) =>
      `  const ${lowerFirst(relation.name)}Options = useQuery({ queryKey: ['${lowerFirst(pluralize(target.name))}'], queryFn: () => api.list${pluralize(target.name)}() });`,
  );
  optionQueries.push(
    ...manyTargets.map(
      ({ relation, target }) =>
        `  const ${relation.name}ManyOptions = useQuery({ queryKey: ['${lowerFirst(pluralize(target.name))}'], queryFn: () => api.list${pluralize(target.name)}() });`,
    ),
  );
  if (hasChildComponents || hasReadOnlyComponents) {
    const pc = primaryChild!;
    optionQueries.push(
      `  const ${lowerFirst(pluralize(pc.child.name))}Query = useQuery({
    queryKey: ['${lowerFirst(pluralize(pc.child.name))}', editId],
    queryFn: async () => {
      let page = 1;
      const all: Array<Awaited<ReturnType<typeof api.list${pluralize(pc.child.name)}>>[number]> = [];
      while (true) {
        const items = await api.list${pluralize(pc.child.name)}({ page, limit: 100 });
        if (!items || items.length === 0) break;
        const matching = items.filter((item) => String(item.${pc.rel.name}Id) === String(editId));
        all.push(...matching);
        if (items.length < 100) break;
        page++;
      }
      return all;
    },
    enabled: Boolean(editId),
  });`,
    );
    for (const ext of pc.externalRels) {
      if (!relationTargets.some((t) => t.target.name === ext.target.name)) {
        optionQueries.push(
          `  const ${lowerFirst(pluralize(ext.target.name))}Options = useQuery({
    queryKey: ['${lowerFirst(pluralize(ext.target.name))}'],
    queryFn: async () => {
      let page = 1;
      const all: Array<Awaited<ReturnType<typeof api.list${pluralize(ext.target.name)}>>[number]> = [];
      while (true) {
        const items = await api.list${pluralize(ext.target.name)}({ page, limit: 100 });
        if (!items || items.length === 0) break;
        all.push(...items);
        if (items.length < 100) break;
        page++;
      }
      return all;
    },
  });`,
        );
      }
    }
  }
  if (isPublishRoute) {
    optionQueries.push(
      `  const operationalParametersQuery = useQuery({
    queryKey: ['operationalParameters'],
    queryFn: () => api.listOperationalParameters(),
  });`,
    );
  }
  if (needsResolvedBranch) {
    optionQueries.push(
      `  const resolvedBranchId = (existing.data as { dailyMenu?: { branchId?: string } } | null)?.dailyMenu?.branchId ?? (existing.data as { branchId?: string } | null)?.branchId;
  const branchQuery = useQuery({
    queryKey: ['branch', resolvedBranchId],
    queryFn: () => api.getBranch(resolvedBranchId!),
    enabled: Boolean(resolvedBranchId),
  });`,
    );
  }

  const childHandlersCode = hasChildComponents
    ? `
  const [newProductId, setNewProductId] = useState('');
  const [newComponentType, setNewComponentType] = useState('PLATO');
  const [newPrice, setNewPrice] = useState('0.00');
  const [newAvailable, setNewAvailable] = useState(true);
  const [componentDrafts, setComponentDrafts] = useState<Record<string, { price: string; available: boolean }>>({});

  function getComponentDraft(comp: { id: string; price: number; available: boolean }) {
    return componentDrafts[comp.id] ?? {
      price: Number(comp.price).toFixed(2),
      available: Boolean(comp.available),
    };
  }

  function updateComponentDraft(id: string, patch: Partial<{ price: string; available: boolean }>, basePrice: number, baseAvailable: boolean) {
    setComponentDrafts((prev) => {
      const current = prev[id] ?? { price: Number(basePrice).toFixed(2), available: Boolean(baseAvailable) };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function isValidComponentPrice(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return false;
    const normalized = String(value).trim().replace(',', '.');
    if (normalized === '' || normalized.includes('e') || normalized.includes('E')) return false;
    const parts = normalized.split('.');
    if (parts.length > 2 || parts[0].length === 0) return false;
    for (let i = 0; i < parts[0].length; i++) {
      const ch = parts[0][i];
      if (ch < '0' || ch > '9') return false;
    }
    if (parts.length === 2) {
      if (parts[1].length === 0 || parts[1].length > 2) return false;
      for (let i = 0; i < parts[1].length; i++) {
        const ch = parts[1][i];
        if (ch < '0' || ch > '9') return false;
      }
    }
    const num = Number(normalized);
    return Number.isFinite(num) && !isNaN(num) && num >= 0;
  }

  function formatMonetaryPrice(value: unknown): number {
    const normalized = String(value).trim().replace(',', '.');
    const num = parseFloat(normalized);
    return Math.round(num * 100) / 100;
  }

  const hasInvalidDraftPrices = Object.values(componentDrafts).some((draft) => {
    return !isValidComponentPrice(draft?.price);
  });

  async function handleUpdateComponent(componentId: string) {
    const draft = componentDrafts[componentId];
    if (!draft) {
      toast.info('No hay modificaciones pendientes para este componente.');
      return;
    }
    if (!isValidComponentPrice(draft.price)) {
      toast.error('El importe del componente debe ser un valor numérico monetario exacto con un máximo de dos decimales (ej. 5.50).');
      return;
    }
    const parsedPrice = formatMonetaryPrice(draft.price);
    try {
      await api.update${primaryChild!.child.name}(componentId, {
        price: parsedPrice,
        available: draft.available,
      } as Parameters<typeof api.update${primaryChild!.child.name}>[1]);
      await queryClient.invalidateQueries({ queryKey: ['${lowerFirst(pluralize(primaryChild!.child.name))}', editId] });
      toast.success('Precio y disponibilidad del componente actualizados.');
      setComponentDrafts((prev) => {
        const next = { ...prev };
        delete next[componentId];
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar componente.');
    }
  }

  async function handleAddComponent() {
    if (!editId || !newProductId) {
      toast.error('Seleccione un producto para incorporar al borrador.');
      return;
    }
    if (!isValidComponentPrice(newPrice)) {
      toast.error('Ingrese un importe numérico monetario exacto con un máximo de dos decimales (ej. 5.50).');
      return;
    }
    const parsedPrice = formatMonetaryPrice(newPrice);
    try {
      await api.create${primaryChild!.child.name}({
        ${primaryChild!.rel.name}Id: editId,
        productId: newProductId,
        componentType: newComponentType as never,
        price: parsedPrice,
        available: newAvailable,
      } as Parameters<typeof api.create${primaryChild!.child.name}>[0]);
      await queryClient.invalidateQueries({ queryKey: ['${lowerFirst(pluralize(primaryChild!.child.name))}', editId] });
      toast.success('Componente incorporado al borrador.');
      setNewProductId('');
      setNewPrice('0.00');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al incorporar componente.');
    }
  }

  async function handleRemoveComponent(componentId: string) {
    try {
      await api.delete${primaryChild!.child.name}(componentId);
      await queryClient.invalidateQueries({ queryKey: ['${lowerFirst(pluralize(primaryChild!.child.name))}', editId] });
      toast.success('Componente retirado del borrador.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al retirar componente.');
    }
  }`
    : '';

  const childSectionCode = hasChildComponents
    ? `<div className="flex flex-col gap-3 rounded-lg border p-4 bg-muted/20">
  <div className="flex items-center justify-between">
    <h2 className="text-sm font-semibold text-foreground">Composición de componentes del borrador (platos, proteínas, acompañamientos y extras)</h2>
    <span className="text-xs text-muted-foreground font-mono">Total: {${lowerFirst(pluralize(primaryChild!.child.name))}Query.data?.length ?? 0}</span>
  </div>
  <p className="text-xs text-muted-foreground">
    Configure los platos, proteínas, guarniciones y extras disponibles con sus respectivos precios monetarios para esta versión de menú diario en borrador.
  </p>
  
  <div className="rounded border bg-background p-3 flex flex-col gap-2.5">
    <span className="text-xs font-semibold text-foreground">Incorporar componente al borrador:</span>
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
      <div className="flex flex-col gap-1">
        <label htmlFor="compProductSelect" className="text-xs font-medium">Producto (plato/extra) *</label>
        <select
          id="compProductSelect"
          className={input}
          value={newProductId}
          onChange={(e) => setNewProductId(e.target.value)}
        >
          <option value="">Seleccione producto…</option>
          {${lowerFirst(pluralize(prodTargetName))}Options.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.denomination ?? p.name ?? p.id}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="compTypeSelect" className="text-xs font-medium">Tipo de componente</label>
        <select
          id="compTypeSelect"
          className={input}
          value={newComponentType}
          onChange={(e) => setNewComponentType(e.target.value)}
        >
          <option value="PLATO">Plato principal</option>
          <option value="PROTEINA">Proteína</option>
          <option value="GUARNICION">Acompañamiento / Guarnición</option>
          <option value="EXTRA">Extra / Postre / Bebida</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="compPriceInput" className="text-xs font-medium">Precio monetario exacto</label>
        <Input
          id="compPriceInput"
          type="number"
          step="0.01"
          min="0"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3 py-1">
        <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={newAvailable}
            onChange={(e) => setNewAvailable(e.target.checked)}
            className="size-4"
          />
          Disponible
        </label>
        <Button
          type="button"
          size="sm"
          onClick={handleAddComponent}
          disabled={!newProductId || existing.isLoading || !existing.data || (existing.data as { status?: string })?.status === 'PUBLICADA'}
          ${actionMarker('Incorporar componente al borrador')}
        >
          Incorporar
        </Button>
      </div>
    </div>
  </div>

  <div className="rounded border bg-background overflow-hidden">
    <table className="w-full text-xs text-left">
      <thead className="bg-muted/50 border-b border-border/40 font-medium text-muted-foreground">
        <tr>
          <th className="p-2.5">Producto</th>
          <th className="p-2.5">Tipo</th>
          <th className="p-2.5">Precio</th>
          <th className="p-2.5">Disponibilidad</th>
          <th className="p-2.5 text-right">Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/40">
        {${lowerFirst(pluralize(primaryChild!.child.name))}Query.isLoading && (
          <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Cargando componentes…</td></tr>
        )}
        {!${lowerFirst(pluralize(primaryChild!.child.name))}Query.isLoading && (!${lowerFirst(pluralize(primaryChild!.child.name))}Query.data || ${lowerFirst(pluralize(primaryChild!.child.name))}Query.data.length === 0) && (
          <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Sin componentes registrados en este borrador. Incorpore platos, proteínas, acompañamientos o extras.</td></tr>
        )}
        {${lowerFirst(pluralize(primaryChild!.child.name))}Query.data?.map((comp) => {
          const prod = ${lowerFirst(pluralize(prodTargetName))}Options.data?.find((p) => p.id === comp.productId);
          const draft = getComponentDraft(comp);
          return (
            <tr key={comp.id} className="hover:bg-muted/10">
              <td className="p-2.5 font-medium text-foreground">{prod?.denomination ?? prod?.name ?? comp.productId}</td>
              <td className="p-2.5 font-mono text-[11px]">{String(comp.componentType)}</td>
              <td className="p-2.5">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground font-mono">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className={"w-24 h-7 text-xs font-mono px-2 py-0" + (!isValidComponentPrice(draft.price) ? " border-destructive text-destructive" : "")}
                      value={draft.price}
                      disabled={existing.isLoading || !existing.data || (existing.data as { status?: string })?.status === 'PUBLICADA'}
                      onChange={(e) => updateComponentDraft(comp.id, { price: e.target.value }, Number(comp.price), Boolean(comp.available))}
                    />
                  </div>
                  {!isValidComponentPrice(draft.price) && (
                    <span className="text-[10px] text-destructive font-medium">Importe inválido</span>
                  )}
                </div>
              </td>
              <td className="p-2.5">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.available}
                    disabled={existing.isLoading || !existing.data || (existing.data as { status?: string })?.status === 'PUBLICADA'}
                    onChange={(e) => updateComponentDraft(comp.id, { available: e.target.checked }, Number(comp.price), Boolean(comp.available))}
                    className="size-4"
                  />
                  <span className={draft.available ? 'text-[11px] font-medium text-primary' : 'text-[11px] text-muted-foreground'}>
                    {draft.available ? 'Disponible' : 'No disponible'}
                  </span>
                </label>
              </td>
              <td className="p-2.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={(existing.data as { status?: string })?.status === 'PUBLICADA'}
                    onClick={() => handleUpdateComponent(comp.id)}
                    ${actionMarker('Actualizar componente')}
                  >
                    Actualizar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive hover:text-destructive text-xs"
                    disabled={(existing.data as { status?: string })?.status === 'PUBLICADA'}
                    onClick={() => handleRemoveComponent(comp.id)}
                    ${actionMarker('Retirar componente del borrador')}
                  >
                    Retirar
                  </Button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
  {hasInvalidDraftPrices && (
    <div className="rounded border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive" role="alert">
      <span className="font-semibold">Importes inválidos en componentes pendientes:</span> Corrija o descarte los precios inválidos antes de guardar la versión del borrador.
    </div>
  )}
</div>`
    : '';

  const manyInputs = manyTargets.map(
    ({ relation, target }) =>
      `<div className="flex flex-col gap-2"><label htmlFor="${relation.name}Ids">${text(relation.label ?? labelOf(relation.name))}</label><select id="${relation.name}Ids" multiple className={input} {...register('${relation.name}Ids')}>{${relation.name}ManyOptions.data?.map(option => <option key={option.id} value={option.id}>{String(option.${target.fields[0]!.name} ?? option.id)}</option>)}</select><FieldError message={errors.${relation.name}Ids?.message} /></div>`,
  );
  const usesQuery =
    relationTargets.length > 0 ||
    manyTargets.length > 0 ||
    editable ||
    isRelationBound ||
    hasChildComponents ||
    hasReadOnlyComponents ||
    needsResolvedBranch ||
    isPublishRoute;
  const save =
    editable || isRelationBound
      ? `(editId
        ? api.update${entity.name}(editId, targetValues as Parameters<typeof api.update${entity.name}>[1])
        : api.create${entity.name}(targetValues as Parameters<typeof api.create${entity.name}>[0]))`
      : `api.create${entity.name}(targetValues as Parameters<typeof api.create${entity.name}>[0])`;
  const editingParam =
    editable && own?.operation === 'UPDATE' ? entityParam(entity, names) : undefined;
  const hook = paramsHook(
    names,
    header.join('\n') +
      (editingParam ?? '') +
      (isRelationBound ? names.join(' ') : '') +
      (names.length ? ` ${names.join(' ')}` : ''),
  );
  const prefillFields = [
    ...entity.fields.filter((field) => !field.readOnly).map((field) => field.name),
    ...inputRelations(entity).map((relation) => relation.name + 'Id'),
    ...manyTargets.map(({ relation }) => relation.name + 'Ids'),
    ...(isAccount ? ['roleNames'] : []),
  ];
  const publishSectionCode = isPublishRoute
    ? `<input type="hidden" value="PUBLICADA" {...register('status')} />
<div className="rounded border bg-muted/20 p-4 text-xs space-y-3" role="region" aria-label="Identificación de versión y ciclo operativo">
  <div className="flex items-center justify-between pb-2 border-b border-border/40">
    <span className="font-semibold text-sm text-foreground">Sucursal, fecha operativa y versión seleccionada</span>
    <span className="font-mono text-xs text-muted-foreground">ID: {editId}</span>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div className="p-2.5 rounded bg-background border border-border/40">
      <span className="text-[11px] text-muted-foreground block">Sucursal asignada</span>
      <p className="font-medium text-foreground text-sm mt-0.5">{${needsResolvedBranch ? "branchQuery.data?.name ?? resolvedBranchId ?? 'Sucursal contextual'" : "'Sucursal contextual'"}}</p>
    </div>
    <div className="p-2.5 rounded bg-background border border-border/40">
      <span className="text-[11px] text-muted-foreground block">Menú diario / Fecha operativa</span>
      <p className="font-medium text-foreground text-sm mt-0.5">{(existing.data as { dailyMenu?: { operationalDate?: string } })?.dailyMenu?.operationalDate ? new Date((existing.data as { dailyMenu?: { operationalDate?: string } }).dailyMenu!.operationalDate!).toLocaleDateString() : '—'}</p>
    </div>
    <div className="p-2.5 rounded bg-background border border-border/40">
      <span className="text-[11px] text-muted-foreground block">Versión en evaluación</span>
      <p className="font-medium text-foreground text-sm mt-0.5">{String((existing.data as { versionLabel?: string })?.versionLabel ?? 'VER')}</p>
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-secondary text-secondary-foreground">{String((existing.data as { status?: string })?.status ?? 'BORRADOR')}</span>
    </div>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
    <div className="flex items-center justify-between p-2 rounded bg-background border border-border/40">
      <span className="text-muted-foreground">Instante de creación:</span>
      <span className="font-mono text-foreground">{(existing.data as { creationDate?: string })?.creationDate ? new Date((existing.data as { creationDate?: string }).creationDate!).toLocaleString() : '—'}</span>
    </div>
    <div className="flex items-center justify-between p-2 rounded bg-background border border-border/40">
      <span className="text-muted-foreground">Publicación prevista:</span>
      <span className="font-medium text-foreground">Inmediata tras validación del servidor</span>
    </div>
  </div>
  <p className="text-[11px] text-muted-foreground">Formulario en modo verificación y solicitud de publicación; la composición y precios son de solo lectura y no admiten edición directa en esta instancia.</p>
</div>
<div className="rounded border bg-card p-4 text-xs space-y-3" role="region" aria-label="Composición de componentes de la versión">
  <div className="flex items-center justify-between pb-2 border-b border-border/40">
    <span className="font-semibold text-sm text-foreground">Composición, precios y disponibilidad de la versión (solo lectura)</span>
    <span className="text-muted-foreground text-xs font-mono">{${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data?.length ?? 0} componentes registrados</span>
  </div>
  {${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.isLoading && <div className="text-muted-foreground py-4 text-center">Cargando componentes de la versión…</div>}
  {${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.isError && <div className="text-destructive py-2" role="alert">Error al cargar componentes de la versión.</div>}
  {${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data && ${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.length === 0 && (
    <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-destructive" role="alert">
      No se puede publicar una versión de menú sin componentes registrados. Regrese a la edición de borrador para incorporar platos y productos.
    </div>
  )}
  {${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data && ${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.length > 0 && (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-muted-foreground">
            <th className="py-2 px-2.5">Tipo de componente</th>
            <th className="py-2 px-2.5">Producto referenciado</th>
            <th className="py-2 px-2.5">Precio / Sobrecoste</th>
            <th className="py-2 px-2.5">Disponibilidad</th>
            <th className="py-2 px-2.5 text-center">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.map((comp) => {
            const prod = ${lowerFirst(pluralize(prodTargetName))}Options.data?.find((p) => String(p.id) === String(comp.productId));
            return (
              <tr key={comp.id} className="hover:bg-muted/10">
                <td className="py-2 px-2.5 font-medium text-foreground">{comp.componentType ?? 'Plato base'}</td>
                <td className="py-2 px-2.5">{prod ? (prod.name ?? prod.denomination ?? prod.id) : String(comp.productId)}</td>
                <td className="py-2 px-2.5 font-mono text-foreground">{comp.price != null ? \`$\${Number(comp.price).toFixed(2)}\` : 'Incluido'}</td>
                <td className="py-2 px-2.5">{comp.available ? <span className="text-emerald-600 font-medium">Disponible</span> : <span className="text-muted-foreground">No disponible</span>}</td>
                <td className="py-2 px-2.5 text-center"><span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-secondary-foreground font-mono">Conforme</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  )}
</div>
<div className="rounded border bg-muted/20 p-4 text-xs space-y-3" role="region" aria-label="Reglas de vigencia aprobadas aplicables">
  <div className="flex items-center justify-between pb-2 border-b border-border/40">
    <span className="font-semibold text-sm text-foreground">Reglas de vigencia aprobadas aplicables</span>
    {operationalParametersQuery.data && operationalParametersQuery.data.length > 0 ? (
      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded border border-emerald-300">Directrices operativas aprobadas</span>
    ) : operationalParametersQuery.isLoading ? (
      <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">Consultando directrices…</span>
    ) : (
      <span className="text-[11px] font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded border border-destructive/30">Directrices no disponibles</span>
    )}
  </div>
  {operationalParametersQuery.isLoading && <div role="status" className="text-muted-foreground py-2 text-xs">Consultando y verificando directrices operativas aprobadas en el sistema…</div>}
  {operationalParametersQuery.isError && <div role="alert" className="text-destructive py-2 text-xs">Error al consultar las directrices operativas aprobadas.</div>}
  {!operationalParametersQuery.isLoading && (!operationalParametersQuery.data || operationalParametersQuery.data.length === 0) && (
    <div className="rounded border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive" role="alert">
      <span className="font-semibold">Bloqueo de directrices:</span> No se encontraron directrices de vigencia de OperationalParameter aprobadas en el sistema. La publicación se encuentra bloqueada.
    </div>
  )}
  {operationalParametersQuery.data && operationalParametersQuery.data.length > 0 && (
    <div className="space-y-2">
      {operationalParametersQuery.data.slice(0, 3).map((param) => (
        <div key={param.id} className="p-2.5 rounded bg-background border border-border/40 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">{param.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground">Parámetro operativo</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{param.applicationRules || param.allowedValues || 'Regla operativa autorizada para vigencia comercial.'}</p>
        </div>
      ))}
    </div>
  )}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border/40 text-xs">
    <div className="flex items-center gap-1.5 font-medium">
      <span className={${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data && ${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.length > 0 && !${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.some((c) => c.price == null || Number(c.price) < 0 || isNaN(Number(c.price))) ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>
        {${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data && ${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.length > 0 && !${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.some((c) => c.price == null || Number(c.price) < 0 || isNaN(Number(c.price))) ? '✓' : '✗'}
      </span>
      <span className={${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data && ${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.length > 0 && !${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.some((c) => c.price == null || Number(c.price) < 0 || isNaN(Number(c.price))) ? "text-foreground" : "text-destructive"}>
        Integridad de componentes ({${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data?.length ?? 0} registrados)
      </span>
    </div>
    <div className="flex items-center gap-1.5 font-medium">
      <span className={operationalParametersQuery.data && operationalParametersQuery.data.length > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>
        {operationalParametersQuery.data && operationalParametersQuery.data.length > 0 ? '✓' : '✗'}
      </span>
      <span className={operationalParametersQuery.data && operationalParametersQuery.data.length > 0 ? "text-foreground" : "text-destructive"}>
        Directrices de vigencia de OperationalParameter {operationalParametersQuery.data && operationalParametersQuery.data.length > 0 ? 'aprobadas' : 'no aprobadas'}
      </span>
    </div>
  </div>
  {(!${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data || ${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.length === 0 || operationalParametersQuery.isLoading || !operationalParametersQuery.data || operationalParametersQuery.data.length === 0 || (existing.data as { status?: string })?.status === 'PUBLICADA') && (
    <div className="rounded border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive" role="alert">
      {(existing.data as { status?: string })?.status === 'PUBLICADA'
        ? 'Esta versión ya se encuentra formalmente publicada e inmutable.'
        : 'La solicitud de publicación permanece bloqueada hasta que todas las consultas confirmen componentes válidos y directrices de vigencia de OperationalParameter aprobadas en el sistema.'}
    </div>
  )}
</div>`
    : '';
  const headerBlock = header.length
    ? `      <div className="flex flex-wrap gap-2">\n${indent(header.join('\n'), 8)}\n      </div>\n`
    : '';
  const extraImports = [
    `import { ${hook ? 'useParams, ' : ''}useRouter } from 'next/navigation';`,
    editable || isRelationBound || hasChildComponents || hasReadOnlyComponents ? "import { useEffect, useState } from 'react';" : '',
    "import { useForm } from 'react-hook-form';",
    "import { zodResolver } from '@hookform/resolvers/zod';",
    `import { ${usesQuery ? 'useQuery, ' : ''}useQueryClient } from '@tanstack/react-query';`,
    "import { toast } from 'sonner';",
    "import type { z } from 'zod';",
    `import { ${schema} } from '${SCOPE}/contracts';`,
    `import { api } from '${up}lib/api';`,
  ].filter(Boolean);
  const usesFieldset =
    !isPublishRoute && (isRelationBound || (isEdit && hasPublishedStatus));
  const publishDisabledExpr = isPublishRoute
    ? ` || existing.isLoading || existing.isError || !existing.data || (existing.data as { status?: string })?.status === 'PUBLICADA' || ${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.isLoading || ${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.isError || !${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data || ${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.length === 0 || ${lowerFirst(pluralize(primaryChild?.child.name ?? 'Component'))}Query.data.some((c) => c.price == null || Number(c.price) < 0 || isNaN(Number(c.price))) || operationalParametersQuery.isLoading || operationalParametersQuery.isError || !operationalParametersQuery.data || operationalParametersQuery.data.length === 0`
    : '';
  const body = `    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">${route.screenName.replace(/[<>{}]/g, '')}</h1>
${names.map((n) => `      {${n} && <div className="text-xs text-muted-foreground"><span className="font-semibold">${text(labelOf(n.replace(/id$/i, '')))}:</span> {${n}}</div>}`).join('\n')}
${editable || isRelationBound ? `      {editId && <p className="font-mono text-xs text-muted-foreground">ID: {editId}</p>}\n` : ''}${
    isRelationBound
      ? `      {existing.isLoading && <p role="status" className="text-sm text-muted-foreground">Cargando configuración local…</p>}
      {existing.isError && <p role="alert" className="text-sm text-destructive">Error al consultar la configuración local.</p>}
      {!existing.isLoading && !existing.isError && !existing.data && (
        <p role="status" className="text-sm text-muted-foreground">Sin configuración local previa registrada para esta combinación (modo inicial).</p>
      )}
      {!existing.isLoading && existing.data && (
        <p role="status" className="text-sm text-muted-foreground">Configuración contextual consultada para los parámetros de ámbito seleccionados.</p>
      )}\n`
      : editable
        ? `      {existing.isLoading && <p role="status" className="text-sm text-muted-foreground">Cargando…</p>}
      {existing.isError && <p role="alert" className="text-sm text-destructive">Error al consultar el registro.</p>}
      {Boolean(editId) && !existing.isLoading && !existing.data && <p role="status" className="text-sm text-muted-foreground">Registro no encontrado.</p>}\n`
        : ''
  }${
    isConditionedRoute
      ? `      <div className="rounded border bg-muted/30 p-4 text-xs flex flex-col gap-2.5" role="status">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">Habilitación de precios diferenciados por sucursal</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-secondary text-secondary-foreground">{existing.data ? 'Configuración registrada' : 'Modo inicial'}</span>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">Ámbito: Sucursal contextual</span>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Configuración contextual de precio para el producto y sucursal indicados conforme a las políticas vigentes de diferenciación de precios. Toda modificación rige exclusivamente para esta sucursal sin alterar los precios de otras sedes.
        </p>
        <div className="rounded border bg-background/80 p-2.5 text-xs flex flex-col gap-1">
          <span className="font-semibold text-foreground">Reglas de aplicación y precedencia operativa:</span>
          <p className="text-muted-foreground">El precio local prevalece sobre el catálogo central dentro del periodo de vigencia asignado. En ausencia de precio local o fuera de vigencia, opera el precio referencial único de catálogo. Perfiles autorizados: ${(route.roles ?? entity.writeRoles).join(', ')}.</p>
        </div>
      </div>\n`
      : (entity.writeRoles?.length || route.roles?.length) &&
        (isConditionedRoute || route.screenName.toLowerCase().includes('condicion'))
        ? `      <div className="rounded border bg-muted/40 p-3 text-xs flex flex-col gap-1" role="status">
        <span className="font-semibold text-foreground">Autorización y perfil operativo</span>
        <p className="text-muted-foreground">Operación habilitada exclusivamente para los roles autorizados: ${(route.roles ?? entity.writeRoles).join(', ')}.</p>
      </div>\n`
        : ''
  }${
    route.path.endsWith('/new') || own?.operation === 'CREATE'
      ? `      <div className="rounded border bg-muted/30 p-3 text-xs flex flex-col gap-2" role="status">
        <span className="font-semibold text-sm">Metadatos de auditoría y trazabilidad</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-muted-foreground">
          <div><span className="font-medium text-foreground">Identificador:</span> Autogenerado por el sistema</div>
          <div><span className="font-medium text-foreground">Usuario responsable:</span> Operador en sesión activa (asignado por servidor)</div>
          <div><span className="font-medium text-foreground">Instante UTC:</span> Timestamp UTC registrado automáticamente al guardar</div>
        </div>
        <p className="text-[11px] text-muted-foreground">La trazabilidad del registro se vincula automáticamente en el backend mediante el contexto de sesión autenticada.</p>
      </div>\n`
      : ''
  }${
    isCreation && isDraftCreation
      ? `      <div className="rounded border border-primary/20 bg-primary/5 p-3 text-xs flex flex-col gap-1.5" role="status">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground">Preparación en estado inicial borrador</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-secondary text-secondary-foreground font-mono">Estado inicial: BORRADOR</span>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          El registro se crea en estado borrador conservando la integridad operativa hasta su confirmación o publicación formal.
        </p>
      </div>\n`
      : ''
  }${
    isEdit && entity.fields.some((f) => f.name === 'status')
      ? `      {existing.data && (existing.data as { status?: string }).status === 'BORRADOR' && (
        <div className="rounded border border-primary/20 bg-primary/5 p-3 text-xs flex flex-col gap-1.5" role="status">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Edición de registro en borrador</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-secondary text-secondary-foreground font-mono">BORRADOR</span>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            El registro se conserva en estado borrador hasta su confirmación o publicación formal.
          </p>
        </div>
      )}\n`
      : ''
  }${
    isEdit && entity.name === 'MenuVersion'
      ? `      {existing.data && (
        <div className="rounded border bg-muted/30 p-3 text-xs flex flex-col gap-2" role="status">
          <span className="font-semibold text-sm">Contexto de operación y menú diario en solo lectura</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-muted-foreground">
            <div><span className="font-medium text-foreground">Sucursal:</span> {${needsResolvedBranch ? "branchQuery.data?.name ?? resolvedBranchId ?? 'Sucursal contextual'" : "'Sucursal contextual'"}}</div>
            <div><span className="font-medium text-foreground">Menú diario:</span> {existing.data?.dailyMenu?.id ?? (existing.data as { dailyMenuId?: string })?.dailyMenuId ?? '—'}</div>
            <div><span className="font-medium text-foreground">Fecha operativa:</span> {(existing.data as { dailyMenu?: { operationalDate?: string } })?.dailyMenu?.operationalDate ? new Date((existing.data as { dailyMenu?: { operationalDate?: string } }).dailyMenu!.operationalDate!).toLocaleDateString() : 'Fecha operativa vinculada'}</div>
          </div>
          <p className="text-[11px] text-muted-foreground">La fecha operativa del menú diario y la sucursal asignada rigen el ciclo comercial y se conservan de forma inmutable para esta versión.</p>
        </div>
      )}\n`
      : ''
  }${
    isEdit
      ? `      {existing.data && (existing.data as { status?: string }).status === 'PUBLICADA' && (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex flex-col gap-1" role="alert">
          <span className="font-semibold">Versión publicada inmutable</span>
          <p>Esta versión se encuentra formalmente PUBLICADA y no admite modificaciones operativas ni cambios de composición. Las versiones publicadas se conservan intactas para garantizar la trazabilidad de ventas y auditoría. Para aplicar ajustes, prepare una nueva versión en borrador desde la consulta de menús.</p>
        </div>
      )}\n`
      : ''
  }${
    editable
      ? `      {existing.data && (
        <div className="rounded border bg-muted/30 p-3 text-xs flex flex-col gap-2" role="status">
          <span className="font-semibold text-sm">Trazabilidad del cambio y detalles actuales</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-muted-foreground pb-2 border-b border-border/40">
            <div><span className="font-medium text-foreground">Usuario responsable:</span> Operador en sesión activa</div>
            <div><span className="font-medium text-foreground">Instante UTC:</span> Timestamp UTC registrado automáticamente al actualizar</div>
            <div><span className="font-medium text-foreground">Identidad canónica:</span> ID {editId} conservado</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
            ${entity.fields
              .slice(0, 4)
              .map(
                (f) =>
                  `<div><span className="font-medium text-foreground">${labelOf(f.name)} actual:</span> {String(existing.data.${f.name} ?? '—')}</div>`,
              )
              .join('\n            ')}
          </div>
          <p className="text-[11px] text-muted-foreground">La actualización de los datos descriptivos conserva de forma íntegra la identidad, asociaciones y trazabilidad auditada en el servidor.</p>
        </div>
      )}\n`
      : ''
  }${
    isRelationBound
      ? `      <div className="rounded border bg-muted/30 p-3 text-xs flex flex-col gap-1.5" role="status">
        <span className="font-semibold text-sm">Contexto y estado general en solo lectura</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
${indent(
  relationParams
    .flatMap(
      (rp) => [
        `<div><span className="font-medium text-foreground">${text(labelOf(rp.relation.name))}:</span> {selected${upperFirst(rp.relation.name)}Id ? (${rp.relation.name}Options.data?.find((o) => o.id === selected${upperFirst(rp.relation.name)}Id)?.name ?? selected${upperFirst(rp.relation.name)}Id) : '—'}</div>`,
        `<div><span className="font-medium text-foreground">Estado general de ${text(labelOf(rp.relation.name))}:</span> {selected${upperFirst(rp.relation.name)}Id ? (() => { const item = ${rp.relation.name}Options.data?.find((o) => o.id === selected${upperFirst(rp.relation.name)}Id); if (!item) return 'No registrado'; return (item as { status?: string }).status ?? 'ACTIVO (Habilitado en catálogo central)'; })() : '—'}</div>`,
      ],
    )
    .join('\n'),
  10,
)}
        </div>
        <p className="text-[11px] text-muted-foreground">Datos de catálogo en solo lectura para el ámbito seleccionado. La configuración local no altera el estado general de las entidades relacionadas.</p>
      </div>\n` +
        relationParams
          .map(
            (rp) =>
              `      {${rp.relation.name}Options.data && !${rp.relation.name}Options.data.some((item) => item.id === selected${upperFirst(rp.relation.name)}Id) && (\n        <p role="alert" className="text-sm text-destructive">{${JSON.stringify(`${labelOf(rp.relation.name)} no encontrado/a.`)}}\n        </p>\n      )}\n`,
          )
          .join('')
      : ''
  }${headerBlock}      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 rounded-lg border p-4">
${
  usesFieldset
    ? isRelationBound
      ? `        {existing.isLoading && <div className="rounded border bg-muted/40 p-3 text-xs text-muted-foreground" role="status">Consultando configuración y autorizaciones vigentes…</div>}
        <fieldset disabled={isSubmitting || existing.isLoading || existing.isError${relationParams.length ? ` || !(${relationParams.map((rp) => `${rp.relation.name}Options.data && ${rp.relation.name}Options.data.some((item) => item.id === selected${upperFirst(rp.relation.name)}Id)`).join(' && ')})` : ''}} className="contents">\n`
      : `        {existing.isLoading && <div className="rounded border bg-muted/40 p-3 text-xs text-muted-foreground" role="status">Verificando registro y estado del borrador…</div>}
        <fieldset disabled={isSubmitting || existing.isLoading || existing.isError || !existing.data || (existing.data as { status?: string })?.status === 'PUBLICADA'} className="contents">\n`
    : ''
}${
  isPublishRoute
    ? indent(publishSectionCode, 8)
    : indent(
        [
          ...inputs,
          ...relationInputs,
          ...manyInputs,
          ...(isAccount
            ? [
                `<div><label htmlFor="roleNames">Roles</label><select id="roleNames" multiple {...register('roleNames')}>${plan.authentication.roles.map((role) => `<option value={${JSON.stringify(role)}}>{${JSON.stringify(role)}}</option>`).join('')}</select></div>`,
              ]
            : []),
        ].join('\n'),
        8,
      ) + (hasChildComponents ? '\n' + indent(childSectionCode, 8) : '')
}        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting${publishDisabledExpr}${isRelationBound ? ` || existing.isLoading || existing.isError${relationParams.length ? ` || !(${relationParams.map((rp) => `${rp.relation.name}Options.data && ${rp.relation.name}Options.data.some((item) => item.id === selected${upperFirst(rp.relation.name)}Id)`).join(' && ')})` : ''}` : ''}${isEdit && !isPublishRoute && hasPublishedStatus ? " || existing.isLoading || existing.isError || !existing.data || (existing.data as { status?: string })?.status === 'PUBLICADA'" : ''}${hasChildComponents ? ' || hasInvalidDraftPrices' : ''}}${own ? ` ${actionMarker(own.label)}` : ''}>
            {isSubmitting ? ${isPublishRoute ? "'Publicando…'" : "'Guardando…'"} : ${own ? JSON.stringify(own.label) : "'Guardar'"}}
          </Button>
${submits.map((a) => `          <Button type="submit" variant="outline" disabled={isSubmitting${publishDisabledExpr}${isRelationBound ? ` || existing.isLoading || existing.isError${relationParams.length ? ` || !(${relationParams.map((rp) => `${rp.relation.name}Options.data && ${rp.relation.name}Options.data.some((item) => item.id === selected${upperFirst(rp.relation.name)}Id)`).join(' && ')})` : ''}` : ''}${isEdit && !isPublishRoute && hasPublishedStatus ? " || existing.isLoading || existing.isError || !existing.data || (existing.data as { status?: string })?.status === 'PUBLICADA'" : ''}${hasChildComponents ? ' || hasInvalidDraftPrices' : ''}} ${actionMarker(a.label)}>\n            ${text(a.label)}\n          </Button>\n`).join('')}${
    returnRoute
      ? needsResolvedBranch
        ? `          <Link href={resolvedBranchId ? \`/branches/\${resolvedBranchId}/menus\` : (editId && ${Boolean(detailRoute)} ? \`/menus/versions/\${editId}\` : '/')} ${actionMarker('Volver')}><Button type="button" variant="outline">Volver</Button></Link>\n`
        : `          <Link href=${routeHref(returnRoute.path, names)} ${actionMarker('Volver')}><Button type="button" variant="outline">Volver</Button></Link>\n`
      : ''
  }${
    detailRoute && editable && !route.path.endsWith('/new')
      ? `          {editId && <Link href=${routeHref(detailRoute.path, names, 'editId')} ${actionMarker('Volver al detalle')}><Button type="button" variant="outline">Volver al detalle</Button></Link>}\n`
      : ''
  }        </div>${usesFieldset ? '\n        </fieldset>' : ''}
      </form>
    </div>`;
  const pushHref = list
    ? list.path.includes('[')
      ? '`' +
        list.path.replace(/\[([a-zA-Z0-9]+)\]/g, (_, name) => {
          const matched = names.find((p) => p.toLowerCase() === name.toLowerCase());
          return matched ? `\${${matched}}` : `\${${name}}`;
        }) +
        '`'
      : `'${list.path}'`
    : null;
  return `'use client';

${pageImports(body, up, extraImports).replace(
  `import { Button } from '${up}components/ui/button';`,
  `import { Button } from '${up}components/ui/button';
${inputImport(body, up)}
import { FieldError } from '${up}components/field-error';`,
)}

const formSchema = ${schema}${isAccount ? '.partial({ password: true })' : ''};
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export default function ${entity.name}FormPage() {
  const router = useRouter();${hook}
  const queryClient = useQueryClient();
${
  editable && !isRelationBound && (hasChildComponents || hasReadOnlyComponents || needsResolvedBranch)
    ? `  // "?id=<record>" opens the form to edit that record.
  const [editId, setEditId] = useState<string | null>(${editingParam ? editingParam : 'null'});
  useEffect(() => {
    setEditId(${editingParam ? editingParam : "new URLSearchParams(window.location.search).get('id')"});
  }, [${editingParam ?? ''}]);
  const existing = useQuery({
    queryKey: ['${lowerFirst(entity.name)}', editId],
    queryFn: () => api.get${entity.name}(editId!),
    enabled: Boolean(editId),
  });\n`
    : ''
}${optionQueries.join('\n')}${optionQueries.length ? '\n' : ''}  const {
    register,
    handleSubmit,${editable || isRelationBound ? '\n    reset,\n    watch,' : ''}
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(formSchema)${formDefaultValues} });${
    isRelationBound
      ? `
  const [editId, setEditId] = useState<string | null>(null);
${relationParams.map((rp) => `  const selected${upperFirst(rp.relation.name)}Id = (watch('${rp.relation.name}Id' as keyof FormInput) as string | undefined) || ${rp.param};`).join('\n')}
  const existing = useQuery({
    queryKey: ['${lowerFirst(pluralize(entity.name))}', ${relationParams.map((rp) => `selected${upperFirst(rp.relation.name)}Id`).join(', ')}],
    queryFn: async () => {
      let page = 1;
      while (true) {
        const items = await api.list${pluralize(entity.name)}({ page, limit: 100 });
        if (!items || items.length === 0) break;
        const match = items.find((item) => ${relationParams.map((rp) => `String(item.${rp.relation.name}Id) === String(selected${upperFirst(rp.relation.name)}Id)`).join(' && ')});
        if (match) return match;
        if (items.length < 100) break;
        page++;
      }
      return null;
    },
  });
  useEffect(() => {
    if (existing.data) {
      setEditId(existing.data.id);
      const allowed = new Set(${JSON.stringify(prefillFields)});
      const values = Object.fromEntries(Object.entries(existing.data).filter(([key]) => allowed.has(key))) as Record<string, unknown>;
${entity.fields
  .filter((field) => field.type === 'DATE')
  .map(
    (field) =>
      `      if (typeof values.${field.name} === 'string') values.${field.name} = values.${field.name}.slice(0, 10);`,
  )
  .join('\n')}
${entity.fields
  .filter((field) => field.type === 'DATETIME')
  .map(
    (field) =>
      `      if (typeof values.${field.name} === 'string') { const date = new Date(values.${field.name}); values.${field.name} = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16); }`,
  )
  .join('\n')}
${entity.fields
  .filter((field) => field.type === 'BOOLEAN' && isRelationBound)
  .map(
    (field) =>
      `      if (typeof values.${field.name} === 'boolean') values.${field.name} = String(values.${field.name});`,
  )
  .join('\n')}
      reset(values as unknown as FormInput);
    } else {
      setEditId(null);
      reset({
${relationParams.map((rp) => `        ${rp.relation.name}Id: selected${upperFirst(rp.relation.name)}Id,`).join('\n')}
${entity.fields
  .filter((field) => field.type === 'BOOLEAN' && isRelationBound)
  .map(
    (field) =>
      `        ${field.name}: '',`,
  )
  .join('\n')}
      } as unknown as FormInput);
    }
  }, [existing.data, reset, ${relationParams.map((rp) => `selected${upperFirst(rp.relation.name)}Id`).join(', ')}]);`
      : editable
        ? `
${!(hasChildComponents || hasReadOnlyComponents || needsResolvedBranch) ? `  // "?id=<record>" opens the form to edit that record.
  const [editId, setEditId] = useState<string | null>(null);
  useEffect(() => {
    setEditId(${editingParam ? editingParam : "new URLSearchParams(window.location.search).get('id')"});
  }, [${editingParam ?? ''}]);
  const existing = useQuery({
    queryKey: ['${lowerFirst(entity.name)}', editId],
    queryFn: () => api.get${entity.name}(editId!),
    enabled: Boolean(editId),
  });\n` : ''}  useEffect(() => {
    if (existing.data) {
      const allowed = new Set(${JSON.stringify(prefillFields)});
      const values = Object.fromEntries(Object.entries(existing.data).filter(([key]) => allowed.has(key))) as Record<string, unknown>;
${isDraftEdit ? "      values.status = 'BORRADOR';\n      delete values.publicationDate;\n" : ''}${entity.fields
  .filter((field) => field.type === 'DATE')
  .map(
    (field) =>
      `      if (typeof values.${field.name} === 'string') values.${field.name} = values.${field.name}.slice(0, 10);`,
  )
  .join('\n')}
${entity.fields
  .filter((field) => field.type === 'DATETIME')
  .map(
    (field) =>
      `      if (typeof values.${field.name} === 'string') { const date = new Date(values.${field.name}); values.${field.name} = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16); }`,
  )
  .join('\n')}
      reset(values as unknown as FormInput);
    }
  }, [existing.data, reset]);`
        : ''
  }${childHandlersCode}

  async function onSubmit(values: FormOutput) {
    try {
      const targetValues = { ...values } as Record<string, unknown>;
${
  (isCreation || isDraftEdit) && defaultStatus
    ? `      targetValues.status = '${defaultStatus}';\n`
    : ''
}${
  isDraftEdit || isDraftCreation
    ? `      delete targetValues.publicationDate;\n`
    : ''
}${
  isPublishRoute
    ? "      targetValues.status = 'PUBLICADA';\n"
    : ''
}${isDescriptiveOnly ? '      delete targetValues.productIds;\n      delete targetValues.products;\n' : ''}${
    isRelationBound
      ? relationParams
          .map(
            (rp) =>
              `      if (!targetValues.${rp.relation.name}Id) targetValues.${rp.relation.name}Id = ${rp.param};`,
          )
          .join('\n') + '\n'
      : ''
  }${
  hasChildComponents
    ? `      for (const [compId, draft] of Object.entries(componentDrafts)) {
        if (!isValidComponentPrice(draft.price)) {
          toast.error('Revise los importes de los componentes pendientes: deben ser valores numéricos monetarios exactos con un máximo de dos decimales (ej. 5.50).');
          return;
        }
      }
      for (const [compId, draft] of Object.entries(componentDrafts)) {
        const parsedPrice = formatMonetaryPrice(draft.price);
        await api.update${primaryChild!.child.name}(compId, {
          price: parsedPrice,
          available: draft.available,
        } as Parameters<typeof api.update${primaryChild!.child.name}>[1]);
      }\n`
    : ''
}      await ${isDescriptiveOnly || isRelationBound ? `(editId ? api.update${entity.name}(editId, targetValues as Parameters<typeof api.update${entity.name}>[1]) : api.create${entity.name}(targetValues as Parameters<typeof api.create${entity.name}>[0]))` : save};
      await queryClient.invalidateQueries({ queryKey: ['${lowerFirst(pluralize(entity.name))}'] });
${hasChildComponents ? `      await queryClient.invalidateQueries({ queryKey: ['${lowerFirst(pluralize(primaryChild!.child.name))}', editId] });\n` : ''}
      toast.success(${isPublishRoute ? "'Versión validada y publicada correctamente.'" : isDraftEdit ? "'Cambios del borrador guardados correctamente.'" : "'Guardado correctamente.'"});
      ${
        needsResolvedBranch
          ? 'if (resolvedBranchId) { router.push(`/branches/${resolvedBranchId}/menus`); } else if (editId && ' +
            Boolean(detailRoute) +
            ') { router.push(`/menus/versions/${editId}`); } else { router.refresh(); }'
          : pushHref
            ? `router.push(${pushHref});`
            : 'router.refresh();'
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar.');
    }
  }

  return (
${body}
  );
}
`;
}

function simplePage(plan: Plan, route: Route): string {
  const module = plan.modules.find((m) => m.localId === route.moduleLocalId)!;
  const entity = plan.entities.find((e) => e.localId === route.entityLocalId);
  const links = plan.routes.filter(
    (r) => r !== route && r.moduleLocalId === route.moduleLocalId && !r.path.includes('['),
  );
  const names = routeParamNames(route.path);
  const idExpr = entityParam(entity, names);
  const parentParams = names.filter((n) => n !== idExpr);
  const parentEntities = parentParams
    .map((param) => {
      const match = plan.entities.find((e) => {
        if (entity && e.localId === entity.localId) return false;
        const eLower = e.name.toLowerCase();
        const pLower = param.toLowerCase();
        return (
          pLower === `${eLower}id` ||
          pLower === `${lowerFirst(e.name)}id` ||
          pLower.endsWith(eLower)
        );
      });
      return match ? { param, entity: match } : null;
    })
    .filter((p): p is { param: string; entity: Entity } => p !== null);

  const header = controls(plan, entity, route.actions, {
    idExpr,
    routeParams: names,
  });
  const hook = paramsHook(
    names,
    header.join('\n') + (idExpr ?? '') + parentEntities.map((p) => p.param).join(''),
  );
  const hasConsultedRecord = Boolean(entity && idExpr && entity.operations.includes('GET'));

  const parentDisplays = parentEntities.map(
    (parent) =>
      `      {${lowerFirst(parent.entity.name)}Query.isLoading && <p role="status" className="text-sm text-muted-foreground">{${JSON.stringify(`Cargando ${labelOf(parent.entity.name)}…`)}}</p>}
      {${lowerFirst(parent.entity.name)}Query.isError && <p role="alert" className="text-sm text-destructive">{${JSON.stringify(`Error al consultar ${labelOf(parent.entity.name)}.`)}` +
      `}</p>}
      {${lowerFirst(parent.entity.name)}Query.data && (
        <div className="rounded border bg-muted/40 p-4 text-xs flex flex-col gap-2" role="status">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-sm">{${JSON.stringify(labelOf(parent.entity.name))}}: {${lowerFirst(parent.entity.name)}Query.data.id}</span>
            {${lowerFirst(parent.entity.name)}Query.data.status && <span className="font-medium bg-background px-2 py-0.5 rounded border">Estado: {String(${lowerFirst(parent.entity.name)}Query.data.status)}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
            ${parent.entity.fields
              .slice(0, 4)
              .map(
                (f) =>
                  `<div><span className="font-medium text-foreground">${labelOf(f.name)}:</span> {String(${lowerFirst(parent.entity.name)}Query.data.${f.name} ?? '—')}</div>`,
              )
              .join('\n            ')}
          </div>
        </div>
      )}`,
  );

  const parentLinks = parentEntities
    .map((parent) => {
      const parentRoute = plan.routes.find(
        (r) =>
          r.entityLocalId === parent.entity.localId && (r.kind === 'DETAIL' || r.kind === 'FORM'),
      );
      if (!parentRoute) return '';
      return `      <div>\n        <Link href=${withId(parentRoute.path, parent.param)}>\n          <Button type="button" variant="outline">{${JSON.stringify(`Volver a ${labelOf(parent.entity.name)}`)}}\n          </Button>\n        </Link>\n      </div>`;
    })
    .filter(Boolean);

  const isCheckoutRoute = route.path.startsWith('/checkout');
  const discardAction = isCheckoutRoute
    ? `      <div className="flex flex-wrap gap-2">\n        <Link href="/sales" ${actionMarker('Descartar borrador')}>\n          <Button type="button" variant="outline">Descartar borrador</Button>\n        </Link>\n      </div>\n`
    : '';

  const body = `    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">${route.screenName.replace(/[<>{}]/g, '')}</h1>
      <p className="text-sm text-muted-foreground">${module.description.replace(/[<>{}]/g, '')}</p>
${parentDisplays.length ? parentDisplays.join('\n') + '\n' : ''}${parentLinks.length ? parentLinks.join('\n') + '\n' : ''}${
    hasConsultedRecord
      ? `      {existing.isLoading && <p role="status" className="text-sm text-muted-foreground">Cargando datos…</p>}
      {existing.isError && <p role="alert" className="text-sm text-destructive">Error al consultar el registro.</p>}
      {existing.data && (
        <div className="rounded border bg-muted/40 p-4 text-xs flex flex-col gap-2" role="status">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-sm">Registro consultado: {existing.data.id}</span>
            {existing.data.status && <span className="font-medium bg-background px-2 py-0.5 rounded border">Estado: {String(existing.data.status)}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
            ${entity!.fields
              .slice(0, 4)
              .map(
                (f) =>
                  `<div><span className="font-medium text-foreground">${labelOf(f.name)}:</span> {String(existing.data.${f.name} ?? '—')}</div>`,
              )
              .join('\n            ')}
          </div>
        </div>
      )}\n`
      : ''
  }${discardAction}${header.length ? `      <div className="flex flex-wrap gap-2">\n${indent(header.join('\n'), 8)}\n      </div>\n` : ''}${
    links.length
      ? `      <ul className="grid gap-2 sm:grid-cols-2">
${links.map((l) => `        <li>\n          <Link className="block rounded-lg border p-4 hover:bg-muted" href="${l.path}">\n            ${l.screenName.replace(/[<>{}]/g, '')}\n          </Link>\n        </li>`).join('\n')}
      </ul>
`
      : ''
  }    </div>`;

  const hasQueries = hasConsultedRecord || parentEntities.length > 0;
  const client =
    body.includes('<ActionButton') || body.includes('<ActionForm') || Boolean(hook) || hasQueries;
  const extraImports = [
    hook ? "import { useParams } from 'next/navigation';" : '',
    hasQueries ? "import { useQuery } from '@tanstack/react-query';" : '',
    body.includes('<ActionButton') || body.includes('<ActionForm') || hasQueries
      ? `import { api } from '${toWebRoot(route.path)}lib/api';`
      : '',
  ].filter(Boolean);
  const imports = pageImports(body, toWebRoot(route.path), extraImports);
  return `${client ? "'use client';\n\n" : ''}${imports ? `${imports}\n\n` : ''}export default function ${upperFirst(route.screenName.replace(/[^A-Za-z0-9]/g, '')) || 'Screen'}Page() {${hook}${
    hasConsultedRecord
      ? `\n  const existing = useQuery({\n    queryKey: ['${lowerFirst(entity!.name)}', ${idExpr}],\n    queryFn: () => api.get${entity!.name}(${idExpr}!),\n    enabled: Boolean(${idExpr}),\n  });`
      : ''
  }${parentEntities
    .map(
      (parent) =>
        `\n  const ${lowerFirst(parent.entity.name)}Query = useQuery({\n    queryKey: ['${lowerFirst(parent.entity.name)}', ${parent.param}],\n    queryFn: () => api.get${parent.entity.name}(${parent.param}!),\n    enabled: Boolean(${parent.param}),\n  });`,
    )
    .join('')}
  return (
${body}
  );
}
`;
}

const ACTION_BUTTON = `'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';

// A screen action that calls the API (DEC-121): busy state, optional
// confirmation and feedback in Spanish.
export function ActionButton({
  run,
  onDone,
  confirm,
  ...props
}: {
  'data-action': string;
  run: () => Promise<unknown>;
  onDone?: () => unknown;
  confirm?: string;
}) {
  const [busy, setBusy] = useState(false);
  const label = props['data-action'];
  async function handleClick() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    try {
      await run();
      toast.success('Acción realizada.');
      await onDone?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" variant="outline" disabled={busy} data-action={label} onClick={handleClick}>
      {busy ? 'Procesando…' : label}
    </Button>
  );
}
`;

export function frontendFiles(ctx: GenerationContext): GeneratedProjectFile[] {
  const { plan: storedPlan, template, projectName, theme } = ctx;
  const plan = {
    ...storedPlan,
    entities: storedPlan.entities.map((entity) => ({
      ...entity,
      fields: entity.fields.filter((field) => !field.internal),
    })),
  };
  const themeToggle = theme?.content.mode === 'BOTH';
  const auth = plan.authentication.required;
  const hasE2E = plan.tests.some((t) => t.kind === 'E2E');
  const entityById = new Map(plan.entities.map((e) => [e.localId, e]));
  const navRoutes = plan.routes.filter((r) => !r.path.includes('[') && r.path !== '/');
  const files: GeneratedProjectFile[] = [];
  if (plan.customEndpoints.some((endpoint) => endpoint.contract)) {
    const component = actionFormFile();
    component.planElements = plan.customEndpoints
      .filter((endpoint) => endpoint.contract)
      .map((endpoint) => `endpoint:${endpoint.method} ${endpoint.path}`);
    files.push(component);
  }

  files.push(
    file(
      'apps/web/package.json',
      json({
        name: `${SCOPE}/web`,
        version: '0.1.0',
        private: true,
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
          typecheck: 'tsc --noEmit',
          lint: 'eslint app components lib',
          test: 'vitest run',
          ...(hasE2E ? { 'test:e2e': 'playwright test' } : {}),
        },
        dependencies: dependencies(
          template,
          [
            '@hookform/resolvers',
            '@tanstack/react-query',
            'class-variance-authority',
            'clsx',
            'lucide-react',
            'next',
            'react',
            'react-dom',
            'react-hook-form',
            'sonner',
            'tailwind-merge',
            'zod',
          ],
          [`${SCOPE}/api-client`, `${SCOPE}/contracts`],
        ),
        devDependencies: dependencies(template, [
          '@tailwindcss/postcss',
          '@testing-library/react',
          '@types/node',
          '@types/react',
          '@types/react-dom',
          '@vitejs/plugin-react',
          'jsdom',
          'tailwindcss',
          'typescript',
          'vitest',
          ...(hasE2E ? ['@playwright/test'] : []),
        ]),
      }),
      { kind: 'CONFIG' },
    ),
    file(
      'apps/web/tsconfig.json',
      json({
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          lib: ['dom', 'dom.iterable', 'esnext'],
          module: 'esnext',
          moduleResolution: 'bundler',
          jsx: 'preserve',
          allowJs: false,
          noEmit: true,
          incremental: true,
          isolatedModules: true,
          plugins: [{ name: 'next' }],
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      }),
      { kind: 'CONFIG' },
    ),
    file(
      'apps/web/next-env.d.ts',
      '/// <reference types="next" />\n/// <reference types="next/image-types/global" />',
      { kind: 'CONFIG' },
    ),
    file(
      'apps/web/next.config.ts',
      `import type { NextConfig } from 'next';\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;`,
      {
        kind: 'CONFIG',
      },
    ),
    file(
      'apps/web/postcss.config.mjs',
      "export default { plugins: { '@tailwindcss/postcss': {} } };",
      { kind: 'CONFIG' },
    ),
    file(
      'apps/web/vitest.config.mts',
      `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['{app,components,lib}/**/*.spec.{ts,tsx}'],
  },
});
`,
      { kind: 'CONFIG' },
    ),
    file('apps/web/app/globals.css', globalsCss(theme?.content), {
      kind: 'SOURCE',
      planElements: theme ? [`design-theme:${theme.code}`] : [],
    }),
    file(
      'apps/web/lib/utils.ts',
      `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,
    ),
    file(
      'apps/web/lib/utils.spec.ts',
      `import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges conflicting Tailwind classes, keeping the last one', () => {
    expect(cn('px-2 py-1', undefined, 'px-4')).toBe('py-1 px-4');
  });
});
`,
      { kind: 'TEST' },
    ),
    file(
      'apps/web/lib/api.ts',
      `import { createApiClient } from '${SCOPE}/api-client';

${
  auth
    ? `const TOKEN_KEY = 'access-token';

// Access token kept for the browser session only (never persisted long-term).
export const accessToken = {
  get: () => (typeof window === 'undefined' ? null : window.sessionStorage.getItem(TOKEN_KEY)),
  set: (token: string) => window.sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => window.sessionStorage.removeItem(TOKEN_KEY),
};

`
    : ''
}export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
${
  plan.authentication.local?.scope
    ? `
export const operationScope = {
 get: () => typeof window === 'undefined' ? null : window.sessionStorage.getItem('operation-scope'),
 set: (id: string) => { window.sessionStorage.setItem('operation-scope', id); window.dispatchEvent(new Event('operation-scope-changed')); },
 clear: () => { window.sessionStorage.removeItem('operation-scope'); window.dispatchEvent(new Event('operation-scope-changed')); },
};`
    : ''
}

export const api = createApiClient({
  baseUrl: API_URL,${auth ? '\n  getToken: accessToken.get,' : ''}${
    ctx.plan.authentication.local
      ? `
  fetch: async (input, init) => {
    const requestToken = accessToken.get();
    ${plan.authentication.local?.scope ? `const headers = new Headers(init?.headers); const scopeId = operationScope.get(); if (scopeId) headers.set('x-operation-scope', scopeId);` : ''}
    const response = await fetch(input, ${plan.authentication.local?.scope ? '{ ...init, headers }' : 'init'});
    if (response.status === 401 && typeof window !== 'undefined' && requestToken && accessToken.get() === requestToken && !String(input).endsWith('/auth/login')) {
      accessToken.clear();
      ${plan.authentication.local?.scope ? 'operationScope.clear();' : ''}
      window.sessionStorage.setItem('session-expired', 'true');
      window.location.assign(${JSON.stringify(ctx.plan.routes.find((route) => route.actions.some((action) => action.endpoint === 'POST /auth/login'))?.path ?? '/access')});
    }
    return response;
  },`
      : ''
  }
});
`,
    ),
    file(
      'apps/web/components/ui/button.tsx',
      `import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        outline: 'border bg-background hover:bg-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
`,
    ),
    file(
      'apps/web/components/ui/input.tsx',
      `import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export const input =
  'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(input, className)} {...props} />;
}
`,
    ),
    file(
      'apps/web/components/field-error.tsx',
      `export function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  ) : null;
}
`,
    ),
    file('apps/web/components/action-button.tsx', ACTION_BUTTON),
    file(
      'apps/web/components/page-state.tsx',
      `import type { ReactNode } from 'react';

// Shared loading / error / empty handling for every data screen.
export function PageState<T>({
  query,
  empty,
  children,
}: {
  query: { isLoading: boolean; error: unknown; data: T | undefined };
  empty?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (query.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : 'No se pudo cargar la información.'}
      </p>
    );
  if (query.data === undefined || (Array.isArray(query.data) && query.data.length === 0))
    return <p className="text-sm text-muted-foreground">{empty ?? 'Sin información.'}</p>;
  return <>{children(query.data)}</>;
}
`,
    ),
    file(
      'apps/web/components/app-nav.tsx',
      `'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/utils';

export const NAV_ITEMS = ${JSON.stringify(
        [
          { href: '/', label: 'Inicio' },
          ...navRoutes.map((r) => ({ href: r.path, label: r.screenName })),
          ...(auth ? [{ href: '/access', label: 'Acceso' }] : []),
        ],
        null,
        2,
      )};

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-2 text-sm hover:bg-muted',
            pathname === item.href && 'bg-muted font-medium',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
`,
      { origin: 'DETERMINISTIC', planElements: navRoutes.map((r) => `route:${r.path}`) },
    ),
    file(
      'apps/web/components/app-nav.spec.tsx',
      `import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppNav, NAV_ITEMS } from './app-nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('AppNav', () => {
  it('links every planned screen and marks the current one', () => {
    render(<AppNav />);
    for (const item of NAV_ITEMS) expect(screen.getByRole('link', { name: item.label })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Inicio' }).getAttribute('aria-current')).toBe('page');
  });
});
`,
      { origin: 'DETERMINISTIC', kind: 'TEST' },
    ),
    file(
      'apps/web/app/providers.tsx',
      `'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
`,
    ),
    file(
      'apps/web/app/layout.tsx',
      `import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppNav } from '../components/app-nav';
${themeToggle ? "import { ThemeToggle } from '../components/theme-toggle';\n" : ''}import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = { title: ${JSON.stringify(projectName)} };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <div className="flex min-h-screen flex-col md:flex-row">
            <aside className="border-b p-4 md:w-60 md:border-b-0 md:border-r">
              <p className="mb-4 px-3 font-semibold">${projectName.replace(/[<>{}]/g, '')}</p>
              <AppNav />
${themeToggle ? '              <div className="mt-4 px-3">\n                <ThemeToggle />\n              </div>\n' : ''}            </aside>
            <main className="flex-1 p-4 md:p-6">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
`,
    ),
  );

  if (themeToggle)
    files.push(
      file('apps/web/components/theme-toggle.tsx', THEME_TOGGLE, {
        planElements: [`design-theme:${theme!.code}`],
      }),
      file('apps/web/components/theme-toggle.spec.tsx', THEME_TOGGLE_SPEC, {
        kind: 'TEST',
        planElements: [`design-theme:${theme!.code}`],
      }),
    );

  if (!plan.routes.some((r) => r.path === '/'))
    files.push(
      file(
        'apps/web/app/page.tsx',
        `${navRoutes.length ? "import Link from 'next/link';\n\n" : ''}export default function HomePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">${projectName.replace(/[<>{}]/g, '')}</h1>
${
  navRoutes.length
    ? `      <ul className="grid gap-2 sm:grid-cols-2">
${navRoutes.map((r) => `        <li>\n          <Link className="block rounded-lg border p-4 hover:bg-muted" href="${r.path}">\n            ${r.screenName.replace(/[<>{}]/g, '')}\n          </Link>\n        </li>`).join('\n')}
      </ul>`
    : `      <p className="text-muted-foreground">Este proyecto aún no define pantallas.</p>`
}
    </div>
  );
}
`,
      ),
    );

  if (auth && !plan.routes.some((route) => route.path === '/access'))
    files.push(
      file(
        'apps/web/app/access/page.tsx',
        `'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { accessToken, API_URL } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { input } from '../../components/ui/input';

// One-click sign-in offered only while the API runs with DEV_LOGIN=true.
export default function AccessPage() {
  const [token, setToken] = useState('');
  const [devRoles, setDevRoles] = useState<string[]>([]);

  useEffect(() => {
    fetch(\`\${API_URL}/auth/dev-login\`)
      .then((response) => (response.ok ? response.json() : null))
      .then((status: { enabled?: boolean; roles?: string[] } | null) => {
        if (status?.enabled) setDevRoles(status.roles ?? []);
      })
      .catch(() => undefined);
  }, []);

  async function enterAs(role: string) {
    try {
      const response = await fetch(\`\${API_URL}/auth/dev-login\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error();
      const { token: issued } = (await response.json()) as { token: string };
      accessToken.set(issued);
      toast.success(\`Sesión iniciada como \${role}.\`);
    } catch {
      toast.error('No se pudo iniciar la sesión. Intente de nuevo.');
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Acceso</h1>
      {devRoles.length ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="text-sm text-muted-foreground">
            Modo de pruebas: entre sin credenciales con el rol que necesite.
          </p>
          <div className="flex flex-wrap gap-2">
            {devRoles.map((role) => (
              <Button key={role} type="button" onClick={() => enterAs(role)}>
                Entrar como {role}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Pegue su token de acceso. Se guarda solo durante esta sesión del navegador.
      </p>
      <textarea
        aria-label="Token de acceso"
        className={input}
        rows={4}
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={!token.trim()}
          onClick={() => {
            accessToken.set(token.trim());
            toast.success('Sesión iniciada.');
          }}
        >
          Guardar
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            accessToken.clear();
            toast.success('Sesión cerrada.');
          }}
        >
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
`,
      ),
    );

  for (const route of plan.routes) {
    const entity = route.entityLocalId ? entityById.get(route.entityLocalId) : undefined;
    const sameEntity = (kind: Route['kind']) =>
      plan.routes.find((r) => r.entityLocalId === route.entityLocalId && r.kind === kind);
    let content: string;
    if (entity && route.kind === 'LIST' && entity.operations.includes('LIST'))
      content = listPage(plan, entity, route);
    else if (
      entity &&
      route.kind === 'DETAIL' &&
      entity.operations.includes('GET') &&
      dynamicParam(route.path)
    )
      content = detailPage(plan, entity, route);
    else if (entity && route.kind === 'FORM' && entity.operations.includes('CREATE'))
      content = formPage(plan, entity, route, sameEntity('LIST'));
    else content = simplePage(plan, route);
    files.push(
      file(pagePath(route.path), content, {
        origin: 'DETERMINISTIC',
        planElements: [
          `route:${route.path}`,
          `module:${route.moduleLocalId}`,
          ...(entity ? [`entity:${entity.localId}`] : []),
        ],
      }),
    );
  }

  if (hasE2E)
    files.push(
      file(
        'apps/web/playwright.config.ts',
        `import { defineConfig } from '@playwright/test';

// End-to-end tests run against a running stack (pnpm run dev); they are not
// part of the offline validation pipeline.
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' },
});
`,
        { kind: 'CONFIG' },
      ),
      file(
        'apps/web/e2e/navigation.spec.ts',
        `import { expect, test } from '@playwright/test';

${plan.tests
  .filter((t) => t.kind === 'E2E')
  .map((t) => `// Planned: ${t.description.replace(/\n/g, ' ')}`)
  .join('\n')}
test('the home page lists the main screens', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
});
`,
        {
          origin: 'DETERMINISTIC',
          kind: 'TEST',
          planElements: plan.tests
            .filter((t) => t.kind === 'E2E')
            .map((t) => `module:${t.moduleLocalId}`),
        },
      ),
    );
  return files;
}
