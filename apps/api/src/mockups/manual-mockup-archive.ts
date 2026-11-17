import JSZip from 'jszip';
import { defaultTreeAdapter, html as htmlSpec, parse, serialize } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { inflate, ManualImportError } from '../construction/manual-import';

export const MANUAL_MOCKUP_LIMITS = {
  archiveBytes: 40 * 1024 * 1024,
  entries: 1000,
  htmlBytes: 1024 * 1024,
  imageBytes: 5 * 1024 * 1024,
  totalBytes: 80 * 1024 * 1024,
} as const;

export interface ManualMockupScreen {
  html: string;
  image: { body: Buffer; contentType: 'image/png' };
}

type ParentNode = DefaultTreeAdapterMap['parentNode'];
type Element = DefaultTreeAdapterMap['element'];

// Files an operating system leaves in a compressed folder; never content.
const SYSTEM_JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The HTML is untrusted content (DEC-166). It is read with a standard HTML
// parser, so what is checked is what a browser would build, and the stored page
// is the parser's own serialization. A page may describe a screen, but it never
// runs code, loads another document or reaches anything outside itself.
const EXTERNAL_ELEMENTS = new Set([
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'base',
  'portal',
]);
// Hidden or animated content that can change a link after it was checked.
const UNSUPPORTED_ELEMENTS = new Set([
  'template',
  'noscript',
  'math',
  'animate',
  'set',
  'animatemotion',
  'animatetransform',
  'discard',
]);
const UNSUPPORTED_ATTRIBUTES = new Set(['srcdoc', 'srcset', 'imagesrcset', 'ping']);
const URL_ATTRIBUTES = new Set([
  'href',
  'xlink:href',
  'src',
  'action',
  'formaction',
  'poster',
  'background',
  'cite',
  'data',
  'longdesc',
  'usemap',
  'lowsrc',
  'dynsrc',
  'codebase',
  'manifest',
]);
// Stored as the first element of every page: opened anywhere, even from disk,
// it cannot run scripts, submit forms or load anything but its own styles and
// embedded images.
const CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/;
const DATA_IMAGE_OR_FONT =
  /^data:(image\/(png|jpe?g|gif|webp|svg\+xml)|font\/[a-z0-9.+-]+|application\/(font|x-font)[a-z0-9.+-]*)[;,]/;

// What is wrong with a URL a page uses, if anything. Only links inside the page,
// relative paths, mail and phone links and, where an image or a font goes,
// embedded data are allowed.
function urlProblem(value: string, embedded?: RegExp): string | undefined {
  // Browsers ignore spaces and control characters when they read a URL.
  const url = [...value]
    .filter((char) => {
      const code = char.codePointAt(0)!;
      return code > 0x20 && (code < 0x7f || code > 0x9f);
    })
    .join('')
    .toLowerCase();
  if (/^(\/\/|\\\\|\/\\|\\\/)/.test(url)) return 'carga recursos de internet';
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(url)?.[1];
  if (!scheme || scheme === 'mailto' || scheme === 'tel') return undefined;
  if (scheme === 'data')
    return embedded?.test(url) ? undefined : 'incrusta datos que no son imágenes';
  if (scheme === 'javascript' || scheme === 'vbscript') return 'contiene enlaces javascript:';
  return 'carga recursos de internet';
}

// CSS escapes such as `\75 rl(` or `@\69mport` are decoded and comments
// removed first, so a hidden function or rule is still found.
function decodeCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\([0-9a-f]{1,6})[ \t\r\n\f]?/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
        ? '\ufffd'
        : String.fromCodePoint(code);
    })
    .replace(/\\(.)/g, '$1');
}

function cssProblem(css: string): string | undefined {
  if (/<\/style/i.test(css)) return 'cierra la etiqueta de estilos';
  const text = decodeCss(css).toLowerCase();
  if (text.includes('@import')) return 'importa otras hojas de estilo';
  if (/expression\s*\(|behavior\s*:|-moz-binding|javascript\s*:|vbscript\s*:/.test(text))
    return 'contiene expresiones';
  for (const match of text.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g)) {
    const problem = urlProblem(match[2]!, DATA_IMAGE_OR_FONT);
    if (problem) return problem;
  }
  // image-set() and @font-face also take addresses as plain strings.
  for (const match of text.matchAll(/(['"])([^'"]*)\1/g))
    if (/^\s*(\/\/|\\\\|[a-z][a-z0-9+.-]*:\/\/)/.test(match[2]!))
      return 'carga recursos de internet';
  return undefined;
}

function textOf(element: Element): string {
  return element.childNodes
    .map((node) => (defaultTreeAdapter.isTextNode(node) ? node.value : ''))
    .join('');
}

function pageProblem(node: ParentNode): string | undefined {
  for (const child of node.childNodes) {
    if (!defaultTreeAdapter.isElementNode(child)) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === 'script') return 'contiene scripts';
    if (
      EXTERNAL_ELEMENTS.has(tag) ||
      (tag === 'meta' && child.attrs.some((attr) => attr.name.toLowerCase() === 'http-equiv'))
    )
      return 'carga contenido externo';
    if (UNSUPPORTED_ELEMENTS.has(tag)) return `contiene la etiqueta <${tag}>, que no se admite`;
    for (const attr of child.attrs) {
      const name = (attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name).toLowerCase();
      if (attr.name.toLowerCase().startsWith('on')) return 'contiene manejadores de eventos';
      if (UNSUPPORTED_ATTRIBUTES.has(name)) return `contiene el atributo ${name}, que no se admite`;
      const image = name === 'src' || (tag === 'image' && attr.name.toLowerCase() === 'href');
      const problem =
        URL_ATTRIBUTES.has(name) || URL_ATTRIBUTES.has(attr.name.toLowerCase())
          ? urlProblem(attr.value, image ? DATA_IMAGE : undefined)
          : name === 'style'
            ? cssProblem(attr.value)
            : undefined;
      if (problem) return problem;
    }
    if (tag === 'style') {
      const problem = cssProblem(textOf(child));
      if (problem) return problem;
    }
    const nested = pageProblem(child);
    if (nested) return nested;
  }
  return undefined;
}

// The checked page as it is stored: the security policy first in its head and
// the shared stylesheet last, so every page stands alone.
function storedPage(document: DefaultTreeAdapterMap['document'], css: string): string {
  const root = document.childNodes.find(
    (node): node is Element => defaultTreeAdapter.isElementNode(node) && node.tagName === 'html',
  )!;
  const head = root.childNodes.find(
    (node): node is Element => defaultTreeAdapter.isElementNode(node) && node.tagName === 'head',
  )!;
  const policy = defaultTreeAdapter.createElement('meta', htmlSpec.NS.HTML, [
    { name: 'http-equiv', value: 'Content-Security-Policy' },
    { name: 'content', value: CONTENT_SECURITY_POLICY },
  ]);
  const first = head.childNodes[0];
  if (first) defaultTreeAdapter.insertBefore(head, policy, first);
  else defaultTreeAdapter.appendChild(head, policy);
  if (css) {
    const style = defaultTreeAdapter.createElement('style', htmlSpec.NS.HTML, []);
    defaultTreeAdapter.insertText(style, `\n${css}\n`);
    defaultTreeAdapter.appendChild(head, style);
  }
  return serialize(document);
}

// Reads a ZIP with one `<screen id>.html` and one `<screen id>.png` for every
// screen of the blueprint, and an optional shared `styles.css` that is placed
// inside each page so every stored HTML stands alone.
export async function readManualMockupArchive(
  archive: Buffer,
  screenIds: readonly string[],
): Promise<Map<string, ManualMockupScreen>> {
  if (archive.length > MANUAL_MOCKUP_LIMITS.archiveBytes)
    throw new ManualImportError('El archivo supera el tamaño máximo permitido.');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archive);
  } catch {
    throw new ManualImportError('El archivo no es un ZIP válido.');
  }
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && !SYSTEM_JUNK.test(entry.name.replace(/\\/g, '/')),
  );
  if (entries.length > MANUAL_MOCKUP_LIMITS.entries)
    throw new ManualImportError('El archivo contiene demasiadas entradas.');
  const paths = entries.map((entry) => entry.name.replace(/\\/g, '/'));
  // A ZIP made from a folder wraps everything in that folder.
  const first = paths[0]?.split('/')[0];
  const wrapped =
    paths.length > 0 && paths.every((path) => path.includes('/') && path.split('/')[0] === first);
  const known = new Set(screenIds);
  const pages = new Map<string, DefaultTreeAdapterMap['document']>();
  const images = new Map<string, Buffer>();
  let css = '';
  let total = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const [index, entry] of entries.entries()) {
    const path = wrapped ? paths[index]!.slice(first!.length + 1) : paths[index]!;
    const match = /^([^/]+)\.(html|png|css)$/i.exec(path);
    const id = match?.[1];
    const extension = match?.[2]?.toLowerCase();
    const isStyles = path.toLowerCase() === 'styles.css';
    if (!isStyles && (!id || extension === 'css' || !known.has(id)))
      throw new ManualImportError(`«${path}» no corresponde a ninguna pantalla del plano.`);
    const limit = Math.min(
      extension === 'png' ? MANUAL_MOCKUP_LIMITS.imageBytes : MANUAL_MOCKUP_LIMITS.htmlBytes,
      MANUAL_MOCKUP_LIMITS.totalBytes - total,
    );
    const bytes = await inflate(entry, path, limit);
    total += bytes.length;
    if (extension === 'png') {
      if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE))
        throw new ManualImportError(`«${path}» no es una imagen PNG.`);
      if (images.has(id!)) throw new ManualImportError(`«${path}» aparece más de una vez.`);
      images.set(id!, bytes);
      continue;
    }
    let text: string;
    try {
      text = decoder.decode(bytes);
    } catch {
      throw new ManualImportError(`«${path}» no es un archivo de texto UTF-8.`);
    }
    const problem = isStyles ? cssProblem(text) : undefined;
    if (problem) throw new ManualImportError(`«${path}» ${problem}.`);
    if (isStyles) {
      css = text;
      continue;
    }
    const document = parse(text);
    const pageIssue = pageProblem(document);
    if (pageIssue) throw new ManualImportError(`«${path}» ${pageIssue}.`);
    if (pages.has(id!)) throw new ManualImportError(`«${path}» aparece más de una vez.`);
    pages.set(id!, document);
  }
  const missing = screenIds.filter((id) => !pages.has(id) || !images.has(id));
  if (missing.length)
    throw new ManualImportError(
      `Faltan el HTML o la imagen PNG de ${missing.length} pantallas: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}.`,
    );
  const screens = new Map<string, ManualMockupScreen>();
  for (const id of screenIds)
    screens.set(id, {
      html: storedPage(pages.get(id)!, css),
      image: { body: images.get(id)!, contentType: 'image/png' },
    });
  return screens;
}
