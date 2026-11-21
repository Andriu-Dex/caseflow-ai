import ts from 'typescript';
import type {
  ImplementationPlanContent,
  NavigationTreeContent,
  UiBlueprintContent,
} from '@caseflow-ai/contracts';
import type { GeneratedProjectFile } from './types';
import { file } from './types';
import { PlanGenerationError } from '../naming';
import { routeAccess } from './local-auth.templates';

export function applyPresentationShell(
  files: GeneratedProjectFile[],
  routes: { routePath: string; navigation: string }[],
  projectName: string,
  themeToggle: boolean,
  groups?: NavigationGroups,
) {
  const layout = files.find((item) => item.path === 'apps/web/app/layout.tsx');
  if (!layout) throw new PlanGenerationError('No se encontró la estructura de la aplicación.');
  const source = ts.createSourceFile(
    'layout.tsx',
    layout.content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let replaced = false;
  const transformed = ts.transform(source, [
    (context) => (root) => {
      const visit: ts.Visitor = (node) => {
        if (
          ts.isJsxElement(node) &&
          node.openingElement.tagName.getText(source) === 'div' &&
          node.getText(source).includes('<AppNav')
        ) {
          replaced = true;
          return ts.factory.createJsxElement(
            ts.factory.createJsxOpeningElement(
              ts.factory.createIdentifier('PresentationShell'),
              undefined,
              ts.factory.createJsxAttributes([]),
            ),
            [ts.factory.createJsxExpression(undefined, ts.factory.createIdentifier('children'))],
            ts.factory.createJsxClosingElement(ts.factory.createIdentifier('PresentationShell')),
          );
        }
        return ts.visitEachChild(node, visit, context);
      };
      const updated = ts.visitNode(root, visit) as ts.SourceFile;
      return ts.factory.updateSourceFile(updated, [
        ...updated.statements.filter(
          (node) =>
            !ts.isImportDeclaration(node) ||
            !ts.isStringLiteral(node.moduleSpecifier) ||
            !['../components/app-nav', '../components/theme-toggle'].includes(
              node.moduleSpecifier.text,
            ),
        ),
        ts.factory.createImportDeclaration(
          undefined,
          ts.factory.createImportClause(
            false,
            undefined,
            ts.factory.createNamedImports([
              ts.factory.createImportSpecifier(
                false,
                undefined,
                ts.factory.createIdentifier('PresentationShell'),
              ),
            ]),
          ),
          ts.factory.createStringLiteral('../components/presentation-shell'),
        ),
      ]);
    },
  ]);
  try {
    layout.content = ts.createPrinter().printFile(transformed.transformed[0]!);
  } finally {
    transformed.dispose();
  }
  if (!replaced)
    throw new PlanGenerationError('No se pudo aplicar la navegación del diseño aprobado.');
  const scoped = files.some((item) => item.path === 'apps/web/components/operation-context.tsx');
  if (groups && files.some((item) => item.content.includes('api.getAuthOptions()'))) {
    files.push(
      file(
        'apps/web/components/presentation-shell.tsx',
        headerShell(routes, projectName, themeToggle, groups, scoped),
        {
          origin: 'DETERMINISTIC',
          planElements: routes.map((route) => `route:${route.routePath}`),
        },
      ),
    );
    return;
  }
  files.push(
    file(
      'apps/web/components/presentation-shell.tsx',
      `'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppNav } from './app-nav';
${themeToggle ? "import { ThemeToggle } from './theme-toggle';" : ''}
const routes = ${JSON.stringify([...routes].sort((a, b) => (a.routePath.includes('[') === b.routePath.includes('[') ? b.routePath.length - a.routePath.length : a.routePath.includes('[') ? 1 : -1)).map(({ routePath, navigation }) => ({ routePath, navigation })))};
export function PresentationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const selected = routes.find(route => {
    const pattern = route.routePath.split('/');
    const path = pathname.split('/');
    return pattern.length === path.length && pattern.every((part, index) => part.startsWith('[') ? Boolean(path[index]) : part === path[index]);
  });
  if (selected?.navigation === 'NONE') return <main className="min-h-screen p-4 md:p-8">{children}</main>;
  // Even where the design places the menu on top, a long menu only fits in a
  // sidebar, which scrolls and filters it.
  return <div className="flex min-h-screen flex-col bg-muted/40 md:flex-row">
    <aside className="bg-sidebar p-3 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0">
      <p className="mb-4 px-3 py-2 font-bold text-sidebar-strong">{${JSON.stringify(projectName)}}</p>
      <div className="max-h-[50vh] overflow-y-auto md:max-h-[calc(100vh-8rem)]"><AppNav /></div>
      ${themeToggle ? '<div className="mt-4 px-3"><ThemeToggle /></div>' : ''}
    </aside>
    <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
  </div>;
}
`,
      { origin: 'DETERMINISTIC', planElements: routes.map((route) => `route:${route.routePath}`) },
    ),
  );
}

export interface NavigationGroups {
  home?: string;
  logout?: string;
  groups: { label: string; paths: string[] }[];
  // Who may open each screen (the server's own rule), to hide links to the
  // screens this person may not use.
  access?: { path: string; roles: string[]; operations?: string[] }[];
}

// The approved navigation tree groups the screens as the mockups show them:
// each screen belongs to its top-level branch (a section, or a main list or
// view), in the tree's order. The home screen and logout stay outside.
export function navigationGroups(
  plan: ImplementationPlanContent,
  blueprint: UiBlueprintContent,
  tree: NavigationTreeContent,
): NavigationGroups {
  const byId = new Map(tree.nodes.map((node) => [node.localId, node]));
  const topLevel = (node: { parentLocalId?: string }) =>
    Boolean(node.parentLocalId && !byId.get(node.parentLocalId)?.parentLocalId);
  const branch = (localId: string | undefined) => {
    let node = localId ? byId.get(localId) : undefined;
    for (let depth = 0; node && depth < tree.nodes.length; depth += 1) {
      if (topLevel(node)) return node;
      node = node.parentLocalId ? byId.get(node.parentLocalId) : undefined;
    }
    return undefined;
  };
  const home = plan.routes.find((route) =>
    route.actions.some((action) => action.endpoint === 'GET /auth/options'),
  )?.path;
  const logout = plan.routes.find((route) =>
    route.actions.some((action) => action.endpoint === 'POST /auth/logout'),
  )?.path;
  const groups = new Map<string, { label: string; paths: string[] }>(
    tree.nodes.filter(topLevel).map((node) => [node.localId, { label: node.label, paths: [] }]),
  );
  for (const route of plan.routes) {
    if (route.path === home || route.path === logout) continue;
    const screen = blueprint.screens.find((item) => item.localId === route.screenLocalId);
    const node = branch(screen?.navigationNodeLocalId);
    if (node) groups.get(node.localId)!.paths.push(route.path);
  }
  return {
    home,
    logout,
    groups: [...groups.values()].filter((group) => group.paths.length),
    access: routeAccess(plan, Boolean(plan.authentication?.local?.scope)).map(
      ({ path, roles, operations }) => ({ path, roles, ...(operations ? { operations } : {}) }),
    ),
  };
}

// The visual standard (ADR-028): a dark sidebar in the project's own primary
// tone, grouped by module, with the session at its foot; the page on a light
// ground with its breadcrumb above.
function headerShell(
  routes: { routePath: string; navigation: string }[],
  projectName: string,
  themeToggle: boolean,
  { home, logout, groups, access = [] }: NavigationGroups,
  scoped: boolean,
) {
  const initials = (projectName.match(/\p{L}+/gu) ?? [])
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  return `'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ${logout ? 'LogOut, ' : ''}UserRound } from 'lucide-react';
import { api, accessToken } from '../lib/api';
${themeToggle ? "import { ThemeToggle } from './theme-toggle';\n" : ''}
const bareRoutes: string[] = ${JSON.stringify(routes.filter((route) => route.navigation === 'NONE' && !route.routePath.includes('[')).map((route) => route.routePath))};
// The approved navigation grouped by module, shared with screens that list options.
export const groups: { label: string; paths: string[] }[] = ${JSON.stringify(groups)};
// Whether a concrete path (/branches/123/menus) is an instance of a route (/branches/[branchid]/menus).
export const matchesRoute = (route: string, path: string) => {
  const a = route.split('/');
  const b = path.split('/');
  return a.length === b.length && a.every((part, index) => part.startsWith('[') ? Boolean(b[index]) : part === b[index]);
};
export const inGroup = (group: { paths: string[] }, path: string) => group.paths.some((route) => matchesRoute(route, path));
const link = 'block rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-active aria-[current=page]:bg-sidebar-active aria-[current=page]:font-semibold';
${
  scoped
    ? `// Who may open each screen, as the server decides it: links to a screen this
// person may not use are hidden, wherever a page renders them. The server
// still refuses the screen's data on its own.
const access: { path: string; roles: string[]; operations?: string[] }[] = ${JSON.stringify(access)};
function useLinkGuard(person: { roles: string[]; permissions: string[] } | undefined) {
  useEffect(() => {
    if (!person) return;
    const allowed = (path: string) => {
      const route = access.find((item) => matchesRoute(item.path, path));
      return !route || ((!route.roles.length || route.roles.some((role) => person.roles.includes(role))) && (!route.operations?.length || route.operations.some((operation) => person.permissions.includes(operation))));
    };
    const guard = () => {
      for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) link.hidden = !allowed((link.getAttribute('href') ?? '').split(/[?#]/)[0]!);
    };
    guard();
    const observer = new MutationObserver(guard);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    return () => observer.disconnect();
  }, [person]);
}
`
    : ''
}

// The application's sidebar: its name, the approved navigation grouped by
// module (only the options the server authorizes) and the session at its foot.
function Sidebar({ pathname }: { pathname: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const query = useQuery({ queryKey: ['authorized-options'], queryFn: () => api.getAuthOptions(), enabled: ready && Boolean(accessToken.get()) });
  const options = query.data ?? [];
  const sections = groups
    .map((group) => ({ label: group.label, items: options.filter((item) => inGroup(group, item.path)) }))
    .filter((group) => group.items.length);
  const rest = options.filter((item) => item.path !== ${JSON.stringify(home ?? '')} && !groups.some((group) => inGroup(group, item.path)));
  if (rest.length) sections.push({ label: 'Otras opciones', items: rest });
  ${scoped ? "const person = useQuery({ queryKey: ['operation-context'], queryFn: () => api.getAuthContext(), enabled: ready && Boolean(accessToken.get()), retry: false }).data;\n  useLinkGuard(person);" : ''}
  return <aside className="flex flex-col gap-4 bg-sidebar p-3 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0">
    <Link href={${JSON.stringify(home ?? '/')}} className="flex items-center gap-2.5 px-2 py-2">
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-foreground">${initials}</span>
      <span className="font-bold text-sidebar-strong">{${JSON.stringify(projectName)}}</span>
    </Link>
    <nav aria-label="Navegación principal" className="flex max-h-[45vh] flex-col gap-0.5 overflow-y-auto md:max-h-none md:flex-1">
      {!ready || (query.isPending && Boolean(accessToken.get())) ? <p role="status" className="px-3 text-sm text-sidebar-muted">Cargando navegación…</p> : null}
      {query.isError ? <p role="alert" className="px-3 text-sm text-sidebar-strong">No se pudieron consultar las opciones autorizadas.</p> : null}
      ${home ? `{ready && options.length ? <Link href={${JSON.stringify(home)}} aria-current={pathname === ${JSON.stringify(home)} ? 'page' : undefined} className={link}>Inicio</Link> : null}` : ''}
      {sections.map((section) => <div key={section.label} className="flex flex-col gap-0.5">
        <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">{section.label}</p>
        {section.items.map((item) => <Link key={item.path} href={item.path} aria-current={item.path === pathname ? 'page' : undefined} className={link}>{item.label}</Link>)}
      </div>)}
    </nav>
    <div className="flex flex-col gap-1 border-t border-sidebar-active pt-3">
      ${
        scoped
          ? `{person ? <div className="flex items-center gap-2.5 px-2 py-1.5">
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-active text-xs font-semibold text-sidebar-strong">{initials(person.displayName)}</span>
        <span className="flex min-w-0 flex-col leading-tight"><span className="truncate text-sm font-semibold text-sidebar-strong">{person.displayName}</span><span className="truncate text-xs text-sidebar-muted">{person.roles.join(', ')}</span><span className="truncate text-xs text-sidebar-muted">{person.scopes.find((scope) => scope.id === person.selectedScopeId)?.label ?? 'Sin ámbito seleccionado'}</span></span>
      </div> : <p className="flex items-center gap-2 px-3 py-2 text-sm"><UserRound className="h-4 w-4" aria-hidden />Mi sesión</p>}
      <Link href={${JSON.stringify(home ?? '/')}} className={link}>Cambiar contexto de operación</Link>`
          : '<p className="flex items-center gap-2 px-3 py-2 text-sm"><UserRound className="h-4 w-4" aria-hidden />Mi sesión</p>'
      }
      ${themeToggle ? '<div className="px-1"><ThemeToggle /></div>' : ''}
      ${logout ? `<Link href={${JSON.stringify(logout)}} className={link + ' flex items-center gap-2'}><LogOut className="h-4 w-4" aria-hidden />Cerrar sesión</Link>` : ''}
    </div>
  </aside>;
}
${scoped ? "\nconst initials = (name: string) => (name.match(/\\p{L}+/gu) ?? []).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('');\n" : ''}
// Where the page is: its module and its name, above the page.
function Trail({ pathname }: { pathname: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const options = useQuery({ queryKey: ['authorized-options'], queryFn: () => api.getAuthOptions(), enabled: ready && Boolean(accessToken.get()) }).data ?? [];
  const section = groups.find((group) => inGroup(group, pathname));
  const item = options.find((option) => option.path === pathname);
  if (!section || !item) return null;
  return <nav aria-label="Ruta de navegación" className="flex items-center gap-2 border-b bg-background px-4 py-3 text-sm text-muted-foreground md:px-8">
    <span>{section.label}</span><ChevronRight className="h-4 w-4" aria-hidden /><span aria-current="page" className="font-medium text-foreground">{item.label}</span>
  </nav>;
}

export function PresentationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (bareRoutes.includes(pathname)) return <main className="min-h-screen">{children}</main>;
  return <div className="flex min-h-screen flex-col bg-muted/40 md:flex-row">
    <Sidebar pathname={pathname} />
    <div className="flex min-w-0 flex-1 flex-col">
      <Trail pathname={pathname} />
      <main className="mx-auto w-full min-w-0 max-w-screen-2xl flex-1 p-4 md:p-8">{children}</main>
    </div>
  </div>;
}
`;
}
