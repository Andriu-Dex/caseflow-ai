import ts from 'typescript';
import { z } from 'zod';
import { PlanGenerationError } from '../naming';

// Presentation may arrange existing controls, but cannot supply executable code,
// data, attributes, imports, requests, or replacement business logic.
export const presentationSchema = z
  .object({
    navigation: z.enum(['TOP', 'SIDE', 'NONE']),
    limitations: z
      .array(
        z
          .object({
            code: z.enum([
              'MISSING_DATA_BINDING',
              'MISSING_FORM_BINDING',
              'MISSING_ACTION_BINDING',
              'UNSUPPORTED_LAYOUT',
            ]),
            description: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(30),
    nodes: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
            parentId: z.string().nullable().default(null),
            kind: z.enum(['CONTAINER', 'SLOT', 'FRAME']),
            tag: z.enum(['div', 'section', 'header', 'footer', 'aside']).nullable().default(null),
            sourceId: z.string().nullable().default(null),
            className: z.string().max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(150),
  })
  .strict();
export type ScreenPresentation = z.infer<typeof presentationSchema>;
export interface PresentationSource {
  id: string;
  kind: 'SLOT' | 'FRAME';
  jsx: string;
  frames: string[];
  frameTag?: 'form' | 'ActionForm';
}

function pageReturn(source: ts.SourceFile) {
  const component = source.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) &&
      Boolean(node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.DefaultKeyword)),
  );
  const statement = component?.body?.statements.find(ts.isReturnStatement);
  let expression = statement?.expression;
  while (expression && ts.isParenthesizedExpression(expression)) expression = expression.expression;
  if (
    !statement ||
    !expression ||
    !(
      ts.isJsxElement(expression) ||
      ts.isJsxSelfClosingElement(expression) ||
      ts.isJsxFragment(expression)
    )
  )
    throw new PlanGenerationError('La pantalla no expone una composición JSX compatible.');
  return { statement, expression };
}

export function presentationSources(content: string): PresentationSource[] {
  const source = ts.createSourceFile(
    'page.tsx',
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const { expression } = pageReturn(source);
  const result: PresentationSource[] = [];
  const visit = (
    node: ts.JsxChild | ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment,
    frames: string[],
  ) => {
    if (ts.isJsxText(node) && !node.text.trim()) return;
    if (ts.isJsxExpression(node) && !node.expression) return;
    if (ts.isJsxFragment(node)) {
      node.children.forEach((child) => visit(child, frames));
      return;
    }
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(source);
      if (tag === 'form' || tag === 'ActionForm') {
        const id = `source-${result.length}`;
        result.push({
          id,
          kind: 'FRAME',
          jsx: node.openingElement.getText(source),
          frames,
          frameTag: tag,
        });
        node.children.forEach((child) => visit(child, [...frames, id]));
        return;
      }
      // Labels, inputs and their validation stay together in their original scope.
      const field = node.children.some(
        (child) =>
          ts.isJsxElement(child) && child.openingElement.tagName.getText(source) === 'label',
      );
      const attributes = node.openingElement.attributes.properties;
      if (
        !field &&
        ['div', 'section', 'header', 'main', 'aside', 'footer'].includes(tag) &&
        attributes.every(
          (attr) => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'className',
        )
      ) {
        node.children.forEach((child) => visit(child, frames));
        return;
      }
    }
    result.push({ id: `source-${result.length}`, kind: 'SLOT', jsx: node.getText(source), frames });
  };
  visit(expression, []);
  return result;
}

function assertClasses(value: string) {
  // Tailwind utilities only. No arbitrary URLs, CSS properties, selectors or
  // hide/reorder utilities that could conceal controls or required feedback.
  if (
    value &&
    (!/^[a-zA-Z0-9:#.,%/()[\]_!\s-]+$/.test(value) ||
      /(?:url|expression|javascript|data:|https?:|before:|after:|\[&)/i.test(value) ||
      value.split(/\s+/).some((token) => {
        const utility = token.split(':').at(-1)!.replace(/^!/, '');
        return (
          /^(?:hidden|invisible|sr-only|fixed|absolute|text-transparent|overflow-hidden|overflow-clip)$/.test(
            utility,
          ) ||
          /^(?:content-|order-|z-|pointer-events-)/.test(utility) ||
          /^(?:opacity|scale|h|w|max-h|max-w|size)-(?:0|\[0(?:px|rem|em|%)?\])$/.test(utility)
        );
      }))
  )
    throw new PlanGenerationError('La composición contiene estilos no permitidos.');
}

export function validatePresentation(value: ScreenPresentation, sources: PresentationSource[]) {
  presentationSchema.parse(value);
  if (value.limitations.length)
    throw new PlanGenerationError(
      'La pantalla necesita completar su plan de datos, formularios o acciones antes de adaptar el diseño.',
    );
  const byId = new Map(value.nodes.map((node) => [node.id, node]));
  if (
    byId.size !== value.nodes.length ||
    value.nodes.filter((node) => node.parentId === null).length !== 1
  )
    throw new PlanGenerationError('La composición debe tener una única raíz y nodos únicos.');
  const originals = new Map(sources.map((source) => [source.id, source]));
  const used = new Set<string>();
  for (const node of value.nodes) {
    assertClasses(node.className);
    const ancestors: typeof value.nodes = [];
    let parent = node.parentId;
    const seen = new Set([node.id]);
    while (parent !== null) {
      const item = byId.get(parent);
      if (!item || seen.has(parent) || ancestors.length >= 12 || item.kind === 'SLOT')
        throw new PlanGenerationError(
          'La composición contiene referencias, ciclos o niveles inválidos.',
        );
      seen.add(parent);
      ancestors.unshift(item);
      parent = item.parentId;
    }
    if (node.kind === 'CONTAINER') {
      if (!node.tag || node.sourceId)
        throw new PlanGenerationError('Contenedor de presentación inválido.');
    } else {
      const source = originals.get(node.sourceId ?? '');
      if (
        !source ||
        source.kind !== node.kind ||
        used.has(source.id) ||
        node.tag ||
        JSON.stringify(
          ancestors.filter((item) => item.kind === 'FRAME').map((item) => item.sourceId),
        ) !== JSON.stringify(source.frames)
      )
        throw new PlanGenerationError(
          'La composición pierde, duplica o cambia de contexto un control.',
        );
      used.add(source.id);
    }
  }
  if (used.size !== sources.length)
    throw new PlanGenerationError(
      'La composición debe conservar todos los controles y estados de la pantalla.',
    );
}

function styledJsx(jsx: string, className: string, frameTag?: 'form' | 'ActionForm') {
  const frame = Boolean(frameTag);
  if (!className) return jsx;
  // Conditional feedback must not leave an empty styled card when absent.
  if (!frame && jsx.startsWith('{')) {
    const conditionalSource = ts.createSourceFile(
      'conditional.tsx',
      `const slot = <>${jsx}</>;`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const fragment = (conditionalSource.statements[0] as ts.VariableStatement).declarationList
      .declarations[0]!.initializer;
    const child =
      fragment && ts.isJsxFragment(fragment)
        ? fragment.children.find(ts.isJsxExpression)
        : undefined;
    const condition = child?.expression;
    const wrap = (value: ts.Expression) => {
      if (
        value.kind === ts.SyntaxKind.NullKeyword ||
        value.kind === ts.SyntaxKind.FalseKeyword ||
        (ts.isIdentifier(value) && value.text === 'undefined')
      )
        return value;
      return ts.factory.createJsxElement(
        ts.factory.createJsxOpeningElement(
          ts.factory.createIdentifier('div'),
          undefined,
          ts.factory.createJsxAttributes([
            ts.factory.createJsxAttribute(
              ts.factory.createIdentifier('className'),
              ts.factory.createStringLiteral(className),
            ),
          ]),
        ),
        [ts.factory.createJsxExpression(undefined, value)],
        ts.factory.createJsxClosingElement(ts.factory.createIdentifier('div')),
      );
    };
    const result =
      condition && ts.isConditionalExpression(condition)
        ? ts.factory.updateConditionalExpression(
            condition,
            condition.condition,
            condition.questionToken,
            wrap(condition.whenTrue),
            condition.colonToken,
            wrap(condition.whenFalse),
          )
        : condition &&
            ts.isBinaryExpression(condition) &&
            condition.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
          ? ts.factory.updateBinaryExpression(
              condition,
              condition.left,
              condition.operatorToken,
              wrap(condition.right),
            )
          : undefined;
    if (result)
      return `{${ts.createPrinter().printNode(ts.EmitHint.Expression, result, conditionalSource)}}`;
  }
  const parsed = ts.createSourceFile(
    'slot.tsx',
    `const slot = (${jsx}${frameTag ? `</${frameTag}>` : ''});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const print = ts.createPrinter();
  const declaration = (parsed.statements[0] as ts.VariableStatement).declarationList
    .declarations[0]!;
  const expression = (declaration.initializer as ts.ParenthesizedExpression).expression;
  const opening = ts.isJsxElement(expression)
    ? expression.openingElement
    : ts.isJsxSelfClosingElement(expression)
      ? expression
      : undefined;
  const dynamicClass = opening?.attributes.properties.find(
    (attribute): attribute is ts.JsxAttribute =>
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText(parsed) === 'className' &&
      Boolean(attribute.initializer && !ts.isStringLiteral(attribute.initializer)),
  );
  if (
    !opening ||
    (!frame &&
      /^[A-Z]/.test(opening.tagName.getText(parsed)) &&
      !['ActionControls', 'ActionFeedback', 'ActionResult'].includes(
        opening.tagName.getText(parsed),
      )) ||
    (!frame && dynamicClass)
  )
    return `<div className={${JSON.stringify(className)}}>${jsx}</div>`;
  const attributes = ts.factory.createJsxAttributes([
    ...opening.attributes.properties.filter(
      (attr) => !ts.isJsxAttribute(attr) || attr.name.getText(parsed) !== 'className',
    ),
    ts.factory.createJsxAttribute(
      ts.factory.createIdentifier('className'),
      dynamicClass?.initializer &&
        ts.isJsxExpression(dynamicClass.initializer) &&
        dynamicClass.initializer.expression
        ? ts.factory.createJsxExpression(
            undefined,
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createArrayLiteralExpression([
                  dynamicClass.initializer.expression,
                  ts.factory.createStringLiteral(className),
                ]),
                'join',
              ),
              undefined,
              [ts.factory.createStringLiteral(' ')],
            ),
          )
        : ts.factory.createStringLiteral(className),
    ),
  ]);
  const next = ts.isJsxSelfClosingElement(opening)
    ? ts.factory.updateJsxSelfClosingElement(
        opening,
        opening.tagName,
        opening.typeArguments,
        attributes,
      )
    : ts.factory.updateJsxOpeningElement(
        opening,
        opening.tagName,
        opening.typeArguments,
        attributes,
      );
  if (frame) return print.printNode(ts.EmitHint.Unspecified, next, parsed);
  const changed =
    ts.isJsxElement(expression) && ts.isJsxOpeningElement(next)
      ? ts.factory.updateJsxElement(
          expression,
          next,
          expression.children,
          expression.closingElement,
        )
      : next;
  return print.printNode(ts.EmitHint.Unspecified, changed, parsed);
}

export function applyPresentation(content: string, presentation: ScreenPresentation): string {
  const sources = presentationSources(content);
  validatePresentation(presentation, sources);
  const originals = new Map(sources.map((source) => [source.id, source]));
  const render = (node: ScreenPresentation['nodes'][number]): string => {
    const children = presentation.nodes
      .filter((child) => child.parentId === node.id)
      .map(render)
      .join('\n');
    if (node.kind === 'CONTAINER')
      return `<${node.tag} className={${JSON.stringify(node.className)}}>${children}</${node.tag}>`;
    const source = originals.get(node.sourceId!)!;
    if (node.kind === 'FRAME')
      return `${styledJsx(source.jsx, node.className, source.frameTag ?? 'form')}${children}</${source.frameTag ?? 'form'}>`;
    return styledJsx(source.jsx, node.className);
  };
  const jsx = render(presentation.nodes.find((node) => node.parentId === null)!);
  const source = ts.createSourceFile(
    'page.tsx',
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const { statement } = pageReturn(source);
  const replacement = ts.createSourceFile(
    'layout.tsx',
    `const layout = (${jsx});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const expression = (
    (replacement.statements[0] as ts.VariableStatement).declarationList.declarations[0]!
      .initializer as ts.ParenthesizedExpression
  ).expression;
  // Reparse the complete result instead of printing nodes from a different source
  // file, which would give the printer incorrect string and text positions.
  const updated =
    content.slice(0, statement.getStart(source)) +
    `return (${jsx});` +
    content.slice(statement.end);
  const diagnostics =
    ts.transpileModule(updated, {
      fileName: 'page.tsx',
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve },
    }).diagnostics ?? [];
  if (!expression || diagnostics.some((item) => item.category === ts.DiagnosticCategory.Error)) {
    const msgs = diagnostics
      .map((d) => (typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText))
      .join('; ');
    throw new PlanGenerationError(
      `La composición no produce una pantalla TypeScript válida: ${msgs}`,
    );
  }
  return updated;
}
