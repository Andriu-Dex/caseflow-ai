import ts from 'typescript';
import type {
  ImplementationPlanContent,
  NavigationTreeContent,
  UiBlueprintContent,
} from '@caseflow-ai/contracts';
import type { GeneratedProjectFile } from './types';
import { file } from './types';
import { PlanGenerationError } from '../naming';

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
        { origin: 'DETERMINISTIC', planElements: routes.map((route) => `route:${route.routePath}`) },
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
  return <div className="flex min-h-screen flex-col md:flex-row">
    <aside className="border-b bg-background p-4 md:w-72 md:shrink-0 md:border-b-0 md:border-r">
      <p className="mb-4 px-3 font-semibold">{${JSON.stringify(projectName)}}</p>
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
  return { home, logout, groups: [...groups.values()].filter((group) => group.paths.length) };
}

function headerShell(
  routes: { routePath: string; navigation: string }[],
  projectName: string,
  themeToggle: boolean,
  { home, logout, groups }: NavigationGroups,
  scoped: boolean,
) {
  return `'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ${logout ? 'LogOut, ' : ''}UserRound } from 'lucide-react';
import { api, accessToken } from '../lib/api';
${scoped ? "import { OperationContextPanel } from './operation-context';\n" : ''}${themeToggle ? "import { ThemeToggle } from './theme-toggle';\n" : ''}
const bareRoutes: string[] = ${JSON.stringify(routes.filter((route) => route.navigation === 'NONE' && !route.routePath.includes('[')).map((route) => route.routePath))};
const groups: { label: string; paths: string[] }[] = ${JSON.stringify(groups)};
const menu = 'flex min-w-64 flex-col rounded-md border bg-background p-1 shadow-lg md:absolute md:z-30 md:mt-1';

// The application's header: its name, the approved navigation grouped by
// module (only the options the server authorizes) and the session menu.
function Header() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const query = useQuery({ queryKey: ['authorized-options'], queryFn: () => api.getAuthOptions(), enabled: ready && Boolean(accessToken.get()) });
  const options = query.data ?? [];
  const sections = groups
    .map((group) => ({ label: group.label, items: options.filter((item) => group.paths.includes(item.path)) }))
    .filter((group) => group.items.length);
  const rest = options.filter((item) => item.path !== ${JSON.stringify(home ?? '')} && !groups.some((group) => group.paths.includes(item.path)));
  if (rest.length) sections.push({ label: 'Otras opciones', items: rest });
  return <header className="border-b bg-background">
    <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-8">
      <Link href={${JSON.stringify(home ?? '/')}} className="text-xl font-bold text-primary">{${JSON.stringify(projectName)}}</Link>
      <nav aria-label="Navegación principal" className="flex flex-1 flex-wrap items-center gap-1">
        {!ready || (query.isPending && Boolean(accessToken.get())) ? <p role="status" className="text-sm text-muted-foreground">Cargando navegación…</p> : null}
        {query.isError ? <p role="alert" className="text-sm text-destructive">No se pudieron consultar las opciones autorizadas.</p> : null}
        {sections.map((section) => {
          const active = section.items.some((item) => item.path === pathname);
          return <details key={section.label + pathname} className="relative">
            <summary className={'flex cursor-pointer list-none items-center gap-1 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted' + (active ? ' text-primary underline decoration-2 underline-offset-8' : '')}>
              {section.label}<ChevronDown className="h-4 w-4" aria-hidden />
            </summary>
            <div className={menu}>
              {section.items.map((item) => <Link key={item.path} href={item.path} aria-current={item.path === pathname ? 'page' : undefined} className="rounded-md px-3 py-2 text-sm hover:bg-muted aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">{item.label}</Link>)}
            </div>
          </details>;
        })}
      </nav>
      <div className="flex items-center gap-2">
        ${themeToggle ? '<ThemeToggle />' : ''}
        <details key={pathname} className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"><UserRound className="h-4 w-4" aria-hidden />Mi sesión</summary>
          <div className={menu + ' right-0 min-w-80 gap-2 p-3'}>
            ${scoped ? '<OperationContextPanel compact />' : ''}
            ${logout ? `<Link href={${JSON.stringify(logout)}} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"><LogOut className="h-4 w-4" aria-hidden />Cerrar sesión</Link>` : ''}
          </div>
        </details>
      </div>
    </div>
  </header>;
}

export function PresentationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (bareRoutes.includes(pathname)) return <main className="min-h-screen">{children}</main>;
  return <div className="flex min-h-screen flex-col bg-muted/30">
    <Header />
    <main className="mx-auto w-full min-w-0 max-w-screen-2xl flex-1 p-4 md:p-8">{children}</main>
  </div>;
}
`;
}
