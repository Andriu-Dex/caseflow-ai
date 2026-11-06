import ts from 'typescript';
import { reviewBusinessLogic } from './business-logic.service';
import type { ProjectFile } from './project-validation';

export interface RepairMethod {
  path: string;
  className: string;
  methodName: string;
  signature: string;
  imports: string[];
  body: string;
  start: number;
  end: number;
}

export function diagnosedMethods(
  files: readonly ProjectFile[],
  output: string,
): RepairMethod[] | null {
  const diagnostics = [
    ...output.replaceAll('\\', '/').matchAll(/([\w./-]+\.ts)\((\d+),(\d+)\): error TS\d+:/g),
  ];
  if (!diagnostics.length) return null;
  const selected = new Map<string, RepairMethod>();
  for (const diagnostic of diagnostics) {
    const matchingFiles = files.filter(
      (file) => file.path === diagnostic[1] || file.path.endsWith('/' + diagnostic[1]),
    );
    if (matchingFiles.length !== 1) return null;
    const file = matchingFiles[0];
    if (!file?.path.endsWith('-actions.service.ts')) return null;
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
    const line = Number(diagnostic[2]) - 1;
    const column = Number(diagnostic[3]) - 1;
    if (line < 0 || line >= source.getLineStarts().length || column < 0) return null;
    const starts = source.getLineStarts();
    if (column >= (starts[line + 1] ?? file.content.length) - starts[line]!) return null;
    const position = source.getPositionOfLineAndCharacter(line, column);
    let target: RepairMethod | undefined;
    for (const declaration of source.statements.filter(ts.isClassDeclaration)) {
      for (const method of declaration.members.filter(ts.isMethodDeclaration)) {
        if (
          !declaration.name ||
          !ts.isIdentifier(method.name) ||
          !method.body ||
          position < method.body.getStart(source) ||
          position >= method.body.end
        )
          continue;
        target = {
          path: file.path,
          className: declaration.name.text,
          methodName: method.name.text,
          signature: file.content.slice(method.getStart(source), method.body.getStart(source)),
          imports: source.statements
            .filter(ts.isImportDeclaration)
            .map((node) => node.getText(source)),
          body: file.content.slice(method.body.getStart(source) + 1, method.body.end - 1),
          start: method.body.getStart(source) + 1,
          end: method.body.end - 1,
        };
      }
    }
    if (!target) return null;
    selected.set(JSON.stringify([target.path, target.className, target.methodName]), target);
  }
  return selected.size <= 5 ? [...selected.values()] : null;
}

export function applyMethodRepairs(
  files: readonly ProjectFile[],
  targets: readonly RepairMethod[],
  patches: readonly { path: string; className: string; methodName: string; body: string }[],
): { path: string; content: string }[] | null {
  const changed = new Map<string, { target: RepairMethod; body: string }[]>();
  const seen = new Set<string>();
  for (const patch of patches) {
    const key = JSON.stringify([patch.path, patch.className, patch.methodName]);
    const target = targets.find(
      (target) =>
        target.path === patch.path &&
        target.className === patch.className &&
        target.methodName === patch.methodName,
    );
    if (!target || seen.has(key) || !reviewBusinessLogic(patch.body).accepted) return null;
    seen.add(key);
    const wrapper = ts.createSourceFile(
      'method.ts',
      `async function repaired() {\n${patch.body}\n}`,
      ts.ScriptTarget.Latest,
      true,
    );
    if (wrapper.statements.length !== 1 || !ts.isFunctionDeclaration(wrapper.statements[0]!))
      return null;
    let weakensValidation = /@ts-(?:ignore|nocheck)|eslint-disable/.test(patch.body);
    const inspect = (node: ts.Node) => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) weakensValidation = true;
      ts.forEachChild(node, inspect);
    };
    inspect(wrapper);
    if (weakensValidation) return null;
    changed.set(patch.path, [...(changed.get(patch.path) ?? []), { target, body: patch.body }]);
  }
  return [...changed].map(([path, replacements]) => {
    let content = files.find((file) => file.path === path)!.content;
    for (const { target, body } of replacements.sort((a, b) => b.target.start - a.target.start))
      content = content.slice(0, target.start) + '\n' + body + '\n' + content.slice(target.end);
    return { path, content };
  });
}
