import {
  DESIGN_THEME_TOKENS,
  type DesignThemeContent,
  type DesignThemePalette,
  type ImplementationPlanContent,
} from '@caseflow-ai/contracts';
import { lowerFirst, pluralize, upperFirst } from '../naming';
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
const pagePath = (routePath: string) =>
  routePath === '/' ? 'apps/web/app/page.tsx' : `apps/web/app${routePath}/page.tsx`;
// Relative path from a route page back to the apps/web root.
const toWebRoot = (routePath: string) =>
  '../'.repeat(routePath.split('/').filter(Boolean).length + 1);
const dynamicParam = (routePath: string) => routePath.match(/\[([a-zA-Z0-9]+)\]/)?.[1];

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

function listPage(
  entity: Entity,
  route: Route,
  detail: Route | undefined,
  form: Route | undefined,
): string {
  const up = toWebRoot(route.path);
  const plural = pluralize(entity.name);
  const columns = entity.fields.slice(0, 5);
  const detailHref = detail
    ? `\`${detail.path.replace(/\[[a-zA-Z0-9]+\]/, '${row.id}')}\``
    : undefined;
  return `'use client';

${detail || form ? "import Link from 'next/link';\n" : ''}import { useQuery } from '@tanstack/react-query';
import { api } from '${up}lib/api';
import { PageState } from '${up}components/page-state';
${form ? `import { Button } from '${up}components/ui/button';\n` : ''}
export default function ${entity.name}ListPage() {
  const query = useQuery({ queryKey: ['${lowerFirst(plural)}'], queryFn: () => api.list${plural}() });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">${labelOf(plural)}</h1>
${form ? `        <Link href="${form.path}">\n          <Button>Nuevo</Button>\n        </Link>\n` : ''}      </div>
      <PageState query={query} empty="Aún no hay registros.">
        {(rows) => (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
${columns.map((f) => `                  <th className="px-3 py-2 font-medium">${labelOf(f.name)}</th>`).join('\n')}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
${columns
  .map((f, i) =>
    i === 0 && detailHref
      ? `                    <td className="px-3 py-2">\n                      <Link className="text-primary underline" href={${detailHref}}>\n                        {${display(f, `row.${f.name}`)}}\n                      </Link>\n                    </td>`
      : `                    <td className="px-3 py-2">{${display(f, `row.${f.name}`)}}</td>`,
  )
  .join('\n')}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageState>
    </div>
  );
}
`;
}

function detailPage(entity: Entity, route: Route): string {
  const param = dynamicParam(route.path) ?? 'id';
  return `'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '${toWebRoot(route.path)}lib/api';
import { PageState } from '${toWebRoot(route.path)}components/page-state';

export default function ${entity.name}DetailPage() {
  const { ${param} } = useParams<{ ${param}: string }>();
  const query = useQuery({
    queryKey: ['${lowerFirst(entity.name)}', ${param}],
    queryFn: () => api.get${entity.name}(${param}),
  });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">${route.screenName.replace(/[<>{}]/g, '')}</h1>
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
    </div>
  );
}
`;
}

function formPage(plan: Plan, entity: Entity, route: Route, list: Route | undefined): string {
  const up = toWebRoot(route.path);
  const schema = createSchemaName(entity.name);
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
  return `'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ${relationTargets.length ? 'useQuery, ' : ''}useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ${schema} } from '${SCOPE}/contracts';
import { api } from '${up}lib/api';
import { Button } from '${up}components/ui/button';
import { Input, input } from '${up}components/ui/input';
import { FieldError } from '${up}components/field-error';

type FormInput = z.input<typeof ${schema}>;
type FormOutput = z.output<typeof ${schema}>;

export default function ${entity.name}FormPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
${optionQueries.join('\n')}
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(${schema}) });

  async function onSubmit(values: FormOutput) {
    try {
      await api.create${entity.name}(values as Parameters<typeof api.create${entity.name}>[0]);
      await queryClient.invalidateQueries({ queryKey: ['${lowerFirst(pluralize(entity.name))}'] });
      toast.success('Guardado correctamente.');
      ${list ? `router.push('${list.path}');` : 'router.refresh();'}
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar.');
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">${route.screenName.replace(/[<>{}]/g, '')}</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 rounded-lg border p-4">
${[...inputs, ...relationInputs].join('\n')}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </div>
  );
}
`;
}

function simplePage(plan: Plan, route: Route): string {
  const module = plan.modules.find((m) => m.localId === route.moduleLocalId)!;
  const links = plan.routes.filter(
    (r) => r !== route && r.moduleLocalId === route.moduleLocalId && !r.path.includes('['),
  );
  return `${links.length ? "import Link from 'next/link';\n\n" : ''}export default function ${upperFirst(route.screenName.replace(/[^A-Za-z0-9]/g, '')) || 'Screen'}Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">${route.screenName.replace(/[<>{}]/g, '')}</h1>
      <p className="text-sm text-muted-foreground">${module.description.replace(/[<>{}]/g, '')}</p>
${
  links.length
    ? `      <ul className="grid gap-2 sm:grid-cols-2">
${links.map((l) => `        <li>\n          <Link className="block rounded-lg border p-4 hover:bg-muted" href="${l.path}">\n            ${l.screenName.replace(/[<>{}]/g, '')}\n          </Link>\n        </li>`).join('\n')}
      </ul>`
    : ''
}
    </div>
  );
}
`;
}

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
}export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',${auth ? '\n  getToken: accessToken.get,' : ''}
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

import { useState } from 'react';
import { toast } from 'sonner';
import { accessToken } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { input } from '../../components/ui/input';

export default function AccessPage() {
  const [token, setToken] = useState('');
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Acceso</h1>
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
      content = listPage(
        entity,
        route,
        entity.operations.includes('GET') ? sameEntity('DETAIL') : undefined,
        entity.operations.includes('CREATE') ? sameEntity('FORM') : undefined,
      );
    else if (
      entity &&
      route.kind === 'DETAIL' &&
      entity.operations.includes('GET') &&
      dynamicParam(route.path)
    )
      content = detailPage(entity, route);
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
