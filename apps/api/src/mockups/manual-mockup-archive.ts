import JSZip from 'jszip';
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

// Files an operating system leaves in a compressed folder; never content.
const SYSTEM_JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The HTML is untrusted content (DEC-166): it is stored and offered for
// download, so it may describe a screen but never run code or load anything
// from outside the archive.
const FORBIDDEN_HTML: [RegExp, string][] = [
  [/<\s*script\b/i, 'contiene scripts'],
  [/<\s*(iframe|object|embed|link|base|meta\s+http-equiv)\b/i, 'carga contenido externo'],
  [/\son[a-z]+\s*=/i, 'contiene manejadores de eventos'],
  [/javascript\s*:/i, 'contiene enlaces javascript:'],
  [/\b(src|href|action|poster)\s*=\s*["']?\s*(https?:|\/\/)/i, 'carga recursos de internet'],
];
const FORBIDDEN_CSS: [RegExp, string][] = [
  [/@import\b/i, 'importa otras hojas de estilo'],
  [/url\(\s*["']?\s*(https?:|\/\/)/i, 'carga recursos de internet'],
  [/expression\s*\(/i, 'contiene expresiones'],
  [/<\s*\/\s*style/i, 'cierra la etiqueta de estilos'],
];

function check(text: string, rules: [RegExp, string][], path: string) {
  for (const [pattern, reason] of rules)
    if (pattern.test(text)) throw new ManualImportError(`«${path}» ${reason}.`);
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
  const html = new Map<string, string>();
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
    if (isStyles) {
      check(text, FORBIDDEN_CSS, path);
      css = text;
      continue;
    }
    check(text, FORBIDDEN_HTML, path);
    check(
      [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n'),
      FORBIDDEN_CSS.slice(0, 3),
      path,
    );
    if (html.has(id!)) throw new ManualImportError(`«${path}» aparece más de una vez.`);
    html.set(id!, text);
  }
  const missing = screenIds.filter((id) => !html.has(id) || !images.has(id));
  if (missing.length)
    throw new ManualImportError(
      `Faltan el HTML o la imagen PNG de ${missing.length} pantallas: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}.`,
    );
  const screens = new Map<string, ManualMockupScreen>();
  for (const id of screenIds) {
    let page = html.get(id)!;
    if (css) {
      const style = `<style>\n${css}\n</style>`;
      // A function replacer: «$» in the stylesheet must stay literal.
      page = /<\/head>/i.test(page)
        ? page.replace(/<\/head>/i, (head) => `${style}\n${head}`)
        : style + page;
    }
    screens.set(id, { html: page, image: { body: images.get(id)!, contentType: 'image/png' } });
  }
  return screens;
}
