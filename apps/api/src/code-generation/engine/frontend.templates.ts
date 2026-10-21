import {
  DESIGN_THEME_TOKENS,
  type DesignThemeContent,
  type DesignThemePalette,
  type ImplementationPlanContent,
} from '@caseflow-ai/contracts';
import { lowerFirst, pluralize, upperFirst } from '../naming';
import { customEndpointOperationId } from '../openapi.generator';
import { createSchemaName, inputRelations } from './contracts.templates';
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

const labelOf = (name: string) =>
  upperFirst(name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase());

// "/orders/[orderId]" -> "app/orders/[orderId]/page.tsx"
export const pagePath = (routePath: string) =>
  routePath === '/' ? 'apps/web/app/page.tsx' : `apps/web/app${routePath}/page.tsx`;
// Relative path from a route page back to the apps/web root.
const toWebRoot = (routePath: string) =>
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
    case 'DATETIME':
      return `${accessor} ? new Date(${accessor}).toLocaleDateString('es') : '—'`;
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

interface ActionTarget {
  idExpr?: string;
  // The page's URL parameters ([saleId] -> "saleId"), each a variable in scope.
  routeParams?: string[];
  onDone?: string;
  onDelete?: string;
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
      case 'CREATE':
        return form ? linkControl(label, `"${form.path}"`) : null;
      case 'LIST': {
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
  const lines = [
    body.includes('<Link') ? "import Link from 'next/link';" : '',
    ...extra,
    body.includes('<Button') ? `import { Button } from '${up}components/ui/button';` : '',
    body.includes('<ActionButton')
      ? `import { ActionButton } from '${up}components/action-button';`
      : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function listPage(plan: Plan, entity: Entity, route: Route): string {
  const up = toWebRoot(route.path);
  const plural = pluralize(entity.name);
  const queryKey = `['${lowerFirst(plural)}']`;
  const detail = entity.operations.includes('GET')
    ? entityRoute(plan, entity, 'DETAIL')
    : undefined;
  const form = entity.operations.includes('CREATE') ? entityRoute(plan, entity, 'FORM') : undefined;
  const columns = entity.fields.slice(0, 5);
  const refresh = `() => queryClient.invalidateQueries({ queryKey: ${queryKey} })`;
  const pageActions = route.actions.filter((a) => !isItemAction(plan, a));
  const itemActions = route.actions.filter((a) => isItemAction(plan, a));
  const header = controls(plan, entity, pageActions, { onDone: refresh });
  // Without a planned create action, the form keeps its generic entry point.
  if (form && !pageActions.some((a) => a.operation === 'CREATE'))
    header.unshift(`<Link href="${form.path}">\n  <Button>Nuevo</Button>\n</Link>`);
  const rowControls = controls(plan, entity, itemActions, {
    idExpr: 'row.id',
    onDone: refresh,
    onDelete: refresh,
  });
  const detailHref = detail ? withId(detail.path, 'row.id') : undefined;
  const cells = columns.map((f, i) =>
    i === 0 && detailHref
      ? `<td className="px-3 py-2">\n  <Link className="text-primary underline" href=${detailHref}>\n    {${display(f, `row.${f.name}`)}}\n  </Link>\n</td>`
      : `<td className="px-3 py-2">{${display(f, `row.${f.name}`)}}</td>`,
  );
  if (rowControls.length)
    cells.push(
      `<td className="px-3 py-2">\n  <div className="flex flex-wrap gap-2">\n${indent(rowControls.join('\n'), 4)}\n  </div>\n</td>`,
    );
  const body = `    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">${labelOf(plural)}</h1>
${header.length ? `        <div className="flex flex-wrap gap-2">\n${indent(header.join('\n'), 10)}\n        </div>\n` : ''}      </div>
      <PageState query={query} empty="Aún no hay registros.">
        {(rows) => (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
${columns.map((f) => `                  <th className="px-3 py-2 font-medium">${labelOf(f.name)}</th>`).join('\n')}${rowControls.length ? '\n                  <th className="px-3 py-2 font-medium">Acciones</th>' : ''}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
${indent(cells.join('\n'), 20)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageState>
    </div>`;
  const usesClient = body.includes('queryClient');
  return `'use client';

${pageImports(body, up, [`import { ${usesClient ? 'useQueryClient, ' : ''}useQuery } from '@tanstack/react-query';`, `import { api } from '${up}lib/api';`, `import { PageState } from '${up}components/page-state';`])}

export default function ${entity.name}ListPage() {
  const query = useQuery({ queryKey: ${queryKey}, queryFn: () => api.list${plural}() });${usesClient ? '\n  const queryClient = useQueryClient();' : ''}
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
  // The page itself realises a GET action of its own entity.
  const own = route.actions.find((a) => a.operation === 'GET');
  const others = route.actions.filter((a) => a !== own);
  const header = controls(plan, entity, others, {
    idExpr: param,
    onDone: '() => query.refetch()',
    onDelete: `() => router.push('${list?.path ?? '/'}')`,
  });
  const body = `    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold"${own ? ` ${actionMarker(own.label)}` : ''}>${route.screenName.replace(/[<>{}]/g, '')}</h1>
${header.length ? `        <div className="flex flex-wrap gap-2">\n${indent(header.join('\n'), 10)}\n        </div>\n` : ''}      </div>
      <PageState query={query}>
        {(item) => (
          <dl className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
${entity.fields
  .map(
    (f) =>
      `            <div>\n              <dt className="text-xs text-muted-foreground">${labelOf(f.name)}</dt>\n              <dd>{${display(f, `item.${f.name}`)}}</dd>\n            </div>`,
  )
  .join('\n')}
          </dl>
        )}
      </PageState>
    </div>`;
  const usesRouter = body.includes('router.');
  return `'use client';

${pageImports(body, up, [`import { ${usesRouter ? 'useRouter, ' : ''}useParams } from 'next/navigation';`, "import { useQuery } from '@tanstack/react-query';", `import { api } from '${up}lib/api';`, `import { PageState } from '${up}components/page-state';`])}

export default function ${entity.name}DetailPage() {
  const { ${param} } = useParams<{ ${param}: string }>();${usesRouter ? '\n  const router = useRouter();' : ''}
  const query = useQuery({
    queryKey: ['${lowerFirst(entity.name)}', ${param}],
    queryFn: () => api.get${entity.name}(${param}),
  });
  return (
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
  const header = controls(
    plan,
    entity,
    route.actions.filter((a) => a !== own && !submits.includes(a)),
    { idExpr: entityParam(entity, names), routeParams: names },
  );
  const relationTargets = inputRelations(entity)
    .map((relation) => ({
      relation,
      target: plan.entities.find((e) => e.localId === relation.targetEntityLocalId)!,
    }))
    .filter(({ target }) => target.operations.includes('LIST'));
  const inputs = entity.fields.map((field) => {
    const label = `<label htmlFor="${field.name}" className="text-sm font-medium">${labelOf(field.name)}${field.required ? '' : ' (opcional)'}</label>`;
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
        control = `<input id="${field.name}" type="checkbox" className="size-4" {...register('${field.name}')} />`;
        break;
      case 'DATE':
        control = `<Input id="${field.name}" type="date" {...register('${field.name}'${empty ? `, { ${empty.slice(2)} }` : ''})} />`;
        break;
      case 'DATETIME':
        control = `<Input id="${field.name}" type="datetime-local" {...register('${field.name}', { setValueAs: (v: string) => (v ? new Date(v).toISOString() : undefined) })} />`;
        break;
      case 'ENUM':
        control = `<select id="${field.name}" className={input} {...register('${field.name}'${empty ? `, { ${empty.slice(2)} }` : ''})}>
            ${field.required ? '' : '<option value="">—</option>\n            '}${field.enumValues.map((v) => `<option value="${v}">${labelOf(v.toLowerCase())}</option>`).join('\n            ')}
          </select>`;
        break;
      default:
        control = `<Input id="${field.name}" ${field.type === 'DECIMAL' ? 'inputMode="decimal" ' : ''}{...register('${field.name}'${empty ? `, { ${empty.slice(2)} }` : ''})} />`;
    }
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
    return `        <div className="flex flex-col gap-1">
          <label htmlFor="${name}" className="text-sm font-medium">${labelOf(relation.name)}${relation.required ? '' : ' (opcional)'}</label>
          ${
            target
              ? `<select id="${name}" className={input} {...register('${name}'${empty})}>
            <option value="">Seleccione…</option>
            {${lowerFirst(relation.name)}Options.data?.map((option) => (
              <option key={option.id} value={option.id}>
                {String(option.${target.fields[0]!.name} ?? option.id)}
              </option>
            ))}
          </select>`
              : `<Input id="${name}" placeholder="Identificador" {...register('${name}'${empty})} />`
          }
          <FieldError message={errors.${name}?.message} />
        </div>`;
  });
  const optionQueries = relationTargets.map(
    ({ relation, target }) =>
      `  const ${lowerFirst(relation.name)}Options = useQuery({ queryKey: ['${lowerFirst(pluralize(target.name))}'], queryFn: () => api.list${pluralize(target.name)}() });`,
  );
  const usesQuery = relationTargets.length > 0 || editable;
  const save = editable
    ? `(editId
        ? api.update${entity.name}(editId, values as Parameters<typeof api.update${entity.name}>[1])
        : api.create${entity.name}(values as Parameters<typeof api.create${entity.name}>[0]))`
    : `api.create${entity.name}(values as Parameters<typeof api.create${entity.name}>[0])`;
  const hook = paramsHook(names, header.join('\n'));
  const headerBlock = header.length
    ? `      <div className="flex flex-wrap gap-2">\n${indent(header.join('\n'), 8)}\n      </div>\n`
    : '';
  const extraImports = [
    `import { ${hook ? 'useParams, ' : ''}useRouter } from 'next/navigation';`,
    editable ? "import { useEffect, useState } from 'react';" : '',
    "import { useForm } from 'react-hook-form';",
    "import { zodResolver } from '@hookform/resolvers/zod';",
    `import { ${usesQuery ? 'useQuery, ' : ''}useQueryClient } from '@tanstack/react-query';`,
    "import { toast } from 'sonner';",
    "import type { z } from 'zod';",
    `import { ${schema} } from '${SCOPE}/contracts';`,
    `import { api } from '${up}lib/api';`,
  ].filter(Boolean);
  const body = `    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">${route.screenName.replace(/[<>{}]/g, '')}</h1>
${headerBlock}      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 rounded-lg border p-4">
${[...inputs, ...relationInputs].join('\n')}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting}${own ? ` ${actionMarker(own.label)}` : ''}>
            {isSubmitting ? 'Guardando…' : ${own ? JSON.stringify(own.label) : "'Guardar'"}}
          </Button>
${submits.map((a) => `          <Button type="submit" variant="outline" disabled={isSubmitting} ${actionMarker(a.label)}>\n            ${text(a.label)}\n          </Button>\n`).join('')}        </div>
      </form>
    </div>`;
  return `'use client';

${pageImports(body, up, extraImports).replace(
  `import { Button } from '${up}components/ui/button';`,
  `import { Button } from '${up}components/ui/button';
${inputImport(body, up)}
import { FieldError } from '${up}components/field-error';`,
)}

type FormInput = z.input<typeof ${schema}>;
type FormOutput = z.output<typeof ${schema}>;

export default function ${entity.name}FormPage() {
  const router = useRouter();${hook}
  const queryClient = useQueryClient();
${optionQueries.join('\n')}${optionQueries.length ? '\n' : ''}  const {
    register,
    handleSubmit,${editable ? '\n    reset,' : ''}
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(${schema}) });${
    editable
      ? `
  // "?id=<record>" opens the form to edit that record.
  const [editId, setEditId] = useState<string | null>(null);
  useEffect(() => {
    setEditId(new URLSearchParams(window.location.search).get('id'));
  }, []);
  const existing = useQuery({
    queryKey: ['${lowerFirst(entity.name)}', editId],
    queryFn: () => api.get${entity.name}(editId!),
    enabled: Boolean(editId),
  });
  useEffect(() => {
    if (existing.data) reset(existing.data as unknown as FormInput);
  }, [existing.data, reset]);`
      : ''
  }

  async function onSubmit(values: FormOutput) {
    try {
      await ${save};
      await queryClient.invalidateQueries({ queryKey: ['${lowerFirst(pluralize(entity.name))}'] });
      toast.success('Guardado correctamente.');
      ${list ? `router.push('${list.path}');` : 'router.refresh();'}
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
  const header = controls(plan, entity, route.actions, {
    idExpr: entityParam(entity, names),
    routeParams: names,
  });
  const hook = paramsHook(names, header.join('\n'));
  const body = `    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">${route.screenName.replace(/[<>{}]/g, '')}</h1>
      <p className="text-sm text-muted-foreground">${module.description.replace(/[<>{}]/g, '')}</p>
${header.length ? `      <div className="flex flex-wrap gap-2">\n${indent(header.join('\n'), 8)}\n      </div>\n` : ''}${
    links.length
      ? `      <ul className="grid gap-2 sm:grid-cols-2">
${links.map((l) => `        <li>\n          <Link className="block rounded-lg border p-4 hover:bg-muted" href="${l.path}">\n            ${l.screenName.replace(/[<>{}]/g, '')}\n          </Link>\n        </li>`).join('\n')}
      </ul>
`
      : ''
  }    </div>`;
  const client = body.includes('<ActionButton') || Boolean(hook);
  const imports = pageImports(body, toWebRoot(route.path), [
    hook ? "import { useParams } from 'next/navigation';" : '',
    body.includes('<ActionButton') ? `import { api } from '${toWebRoot(route.path)}lib/api';` : '',
  ]);
  return `${client ? "'use client';\n\n" : ''}${imports ? `${imports}\n\n` : ''}export default function ${upperFirst(route.screenName.replace(/[^A-Za-z0-9]/g, '')) || 'Screen'}Page() {${hook}
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
  const { plan, template, projectName, theme } = ctx;
  const themeToggle = theme?.content.mode === 'BOTH';
  const auth = plan.authentication.required;
  const hasE2E = plan.tests.some((t) => t.kind === 'E2E');
  const entityById = new Map(plan.entities.map((e) => [e.localId, e]));
  const navRoutes = plan.routes.filter((r) => !r.path.includes('[') && r.path !== '/');
  const files: GeneratedProjectFile[] = [];

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

export const api = createApiClient({
  baseUrl: API_URL,${auth ? '\n  getToken: accessToken.get,' : ''}
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

  if (auth)
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
