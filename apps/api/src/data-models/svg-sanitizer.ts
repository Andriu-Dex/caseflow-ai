import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

// Real Mermaid/PlantUML rendering (via Kroki) produces richer SVG than a fixed
// template: it is derived, untrusted content that must pass an explicit
// safety boundary before it is stored/returned. This parses the SVG as real
// XML (fast-xml-parser) and rebuilds it from an explicit tag/attribute
// allowlist — never a regex-only filter over the raw string.

const MAX_INPUT_LENGTH = 5_000_000;
const ATTRIBUTE_PREFIX = '@_';
const TEXT_NODE_NAME = '#text';

// foreignObject is kept because Mermaid's ER renderer relies on it for text
// layout (entity/attribute names); its XHTML content is restricted below to
// inert text-flow tags only (div/span/p/br) — no img, a, iframe, object, etc.
const ALLOWED_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'marker',
  'style',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'foreignObject',
  'filter',
  'feDropShadow',
  'div',
  'span',
  'p',
  'br',
]);

// A single flat attribute allowlist is sufficient: none of these names are
// individually dangerous, and href/xlink:href/src/on*-style names are simply
// never included, which is what actually blocks every tested attack vector.
const ALLOWED_ATTRIBUTES = new Set([
  'id',
  'class',
  'style',
  'transform',
  'role',
  'aria-roledescription',
  'aria-hidden',
  'aria-label',
  'xmlns',
  'xmlns:xlink',
  'width',
  'height',
  'viewBox',
  'preserveAspectRatio',
  'version',
  'zoomAndPan',
  'contentStyleType',
  'x',
  'y',
  'dx',
  'dy',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'fill',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'font-family',
  'font-size',
  'text-anchor',
  'dominant-baseline',
  'textLength',
  'lengthAdjust',
  'marker-end',
  'marker-start',
  'refX',
  'refY',
  'markerWidth',
  'markerHeight',
  'orient',
  'flood-color',
  'flood-opacity',
  'stdDeviation',
]);

const UNSAFE_STYLE_PATTERN = /url\(|expression\(|@import|javascript:/i;
// Narrow on purpose: the allowlist above is the real sanitizer. These only
// assert nothing exploitable slipped through it, without risking a false
// positive on ordinary diagram text (entity/attribute/actor names).
const UNSAFE_STRING_ASSERTIONS = [/<script/i, /javascript:/i];

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: ATTRIBUTE_PREFIX,
  textNodeName: TEXT_NODE_NAME,
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
});
const builder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: ATTRIBUTE_PREFIX,
  textNodeName: TEXT_NODE_NAME,
  suppressEmptyNode: false,
  format: false,
});

type XmlNode = Record<string, unknown>;

export class SvgSanitizationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SvgSanitizationError';
  }
}

export function sanitizeDiagramSvg(rawSvg: string): string {
  if (rawSvg.length > MAX_INPUT_LENGTH)
    throw new SvgSanitizationError('El SVG del renderizador excede el límite permitido.');
  // fast-xml-parser's parser is lenient (it tolerates mismatched tags), so
  // structural validity is checked explicitly before trusting the parse.
  const validation = XMLValidator.validate(rawSvg);
  if (validation !== true)
    throw new SvgSanitizationError(`El renderizador devolvió XML no válido: ${validation.err.msg}`);
  let parsed: XmlNode[];
  try {
    parsed = parser.parse(rawSvg) as XmlNode[];
  } catch (cause) {
    throw new SvgSanitizationError('El renderizador devolvió XML no válido.', { cause });
  }
  const sanitized = sanitizeNodes(parsed);
  const root = sanitized.filter((node) => !(TEXT_NODE_NAME in node));
  if (root.length !== 1 || !('svg' in root[0]!))
    throw new SvgSanitizationError('El renderizador no devolvió un documento SVG válido.');
  const output = builder.build(root) as string;
  // Belt-and-suspenders assertion on the already-sanitized output: the
  // allowlist above is the real sanitizer, this only catches a logic bug.
  for (const pattern of UNSAFE_STRING_ASSERTIONS) {
    if (pattern.test(output))
      throw new SvgSanitizationError('El SVG saneado aún contiene contenido no seguro.');
  }
  return output;
}

function sanitizeNodes(nodes: XmlNode[]): XmlNode[] {
  const result: XmlNode[] = [];
  for (const node of nodes) {
    if (TEXT_NODE_NAME in node) {
      result.push(node);
      continue;
    }
    const tagName = Object.keys(node).find((key) => key !== ':@');
    if (!tagName || !ALLOWED_TAGS.has(tagName)) continue; // drop disallowed tag and its subtree
    const children = sanitizeNodes((node[tagName] as XmlNode[] | undefined) ?? []);
    const sanitizedNode: XmlNode = { [tagName]: children };
    const attributes = node[':@'] as Record<string, unknown> | undefined;
    if (attributes) {
      const safeAttributes = sanitizeAttributes(attributes);
      if (Object.keys(safeAttributes).length) sanitizedNode[':@'] = safeAttributes;
    }
    result.push(sanitizedNode);
  }
  return result;
}

function sanitizeAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [prefixedName, value] of Object.entries(attributes)) {
    const name = prefixedName.slice(ATTRIBUTE_PREFIX.length);
    if (!isAttributeNameAllowed(name)) continue;
    if (/^on/i.test(name)) continue; // defense in depth; never allowlisted anyway
    const stringValue = typeof value === 'string' ? value : String(value);
    if (/javascript:/i.test(stringValue)) continue;
    if (name === 'style' && UNSAFE_STYLE_PATTERN.test(stringValue)) continue;
    safe[prefixedName] = value;
  }
  return safe;
}

function isAttributeNameAllowed(name: string): boolean {
  if (ALLOWED_ATTRIBUTES.has(name)) return true;
  if (/^data-[a-zA-Z0-9-]*$/.test(name)) return true;
  if (/^aria-[a-z-]+$/.test(name)) return true;
  return false;
}
