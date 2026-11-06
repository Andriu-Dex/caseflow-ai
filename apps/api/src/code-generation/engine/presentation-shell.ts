import ts from 'typescript';
import type { GeneratedProjectFile } from './types';
import { file } from './types';
import { PlanGenerationError } from '../naming';

export function applyPresentationShell(
  files: GeneratedProjectFile[],
  routes: { routePath: string; navigation: string }[],
  projectName: string,
  themeToggle: boolean,
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
  const placement = selected?.navigation ?? 'SIDE';
  if (placement === 'NONE') return <main className="min-h-screen p-4 md:p-8">{children}</main>;
  const top = placement === 'TOP';
  return <div className={top ? 'flex min-h-screen flex-col' : 'flex min-h-screen flex-col md:flex-row'}>
    <aside className={top ? 'border-b bg-background p-4 [&_nav]:flex-row [&_nav]:flex-wrap' : 'border-b bg-background p-4 md:w-64 md:shrink-0 md:border-b-0 md:border-r'}>
      <p className="mb-4 px-3 font-semibold">{${JSON.stringify(projectName)}}</p>
      <div className={top ? '' : 'max-h-[50vh] overflow-y-auto md:max-h-[80vh]'}><AppNav /></div>
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
