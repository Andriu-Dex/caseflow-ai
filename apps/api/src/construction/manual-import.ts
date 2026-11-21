import type { Readable } from 'node:stream';
import JSZip from 'jszip';
import type { ProjectFile } from './project-validation';

export const MANUAL_IMPORT_LIMITS = {
  archiveBytes: 30 * 1024 * 1024,
  entries: 100_000,
  files: 3000,
  fileBytes: 1024 * 1024,
  totalBytes: 40 * 1024 * 1024,
} as const;

export class ManualImportError extends Error {}

// Build output, dependencies and local tooling of a working folder: never part
// of the project.
const SKIPPED_FOLDERS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  '.turbo',
  'coverage',
  'test-results',
  'playwright-report',
]);

// Written by CASEFlow for each run (lockfile, manifest) or checkpoints of an
// AI generation. Importing the checkpoints would let a hand-written file pass
// as a reviewed AI proposal in a later generation, so they never come in.
const SKIPPED_FILES = new Set(['pnpm-lock.yaml', 'caseflow-manifest.json']);
const SKIPPED_PREFIXES = [
  'docs/business-logic/',
  'docs/presentations/',
  'docs/presentation-findings/',
  'docs/demo-data/',
];
const SKIPPED_DOCUMENTS = new Set(['docs/design-fidelity.json', 'docs/working-copy.json']);

const isEnvironmentFile = (name: string) => /^\.env(\..+)?$/.test(name) && name !== '.env.example';

function kindOf(path: string): ProjectFile['kind'] {
  if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(path) || /(^|\/)e2e\//.test(path)) return 'TEST';
  if (path.startsWith('docs/') || path.endsWith('.md')) return 'DOCUMENTATION';
  if (
    /^(apps|packages)\/[^/]+\/(src|app|components|lib)\//.test(path) ||
    path.startsWith('prisma/')
  )
    return 'SOURCE';
  return 'CONFIG';
}

export interface ManualImport {
  files: ProjectFile[];
  // Plan elements each path declares in the archive's manifest. Untrusted:
  // the caller keeps only the ones the approved plan defines.
  declaredElements: Map<string, string[]>;
  skipped: number;
}

// Reads a ZIP of a hand-written project into text files, without touching the
// file system: nothing in it is executed or extracted here.
export async function readManualArchive(archive: Buffer): Promise<ManualImport> {
  if (archive.length > MANUAL_IMPORT_LIMITS.archiveBytes)
    throw new ManualImportError('El archivo supera el tamaño máximo permitido.');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archive);
  } catch {
    throw new ManualImportError('El archivo no es un ZIP válido.');
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  // Counted before anything is inflated; folders that are left out also count.
  if (entries.length > MANUAL_IMPORT_LIMITS.entries)
    throw new ManualImportError('El archivo contiene demasiadas entradas.');
  const normalized = entries.map((entry) => {
    const path = entry.name.replace(/\\/g, '/');
    const segments = path.split('/');
    if (
      path.startsWith('/') ||
      /^[a-zA-Z]:/.test(path) ||
      path.includes('\0') ||
      segments.some((segment) => segment === '..' || segment === '.' || segment === '')
    )
      throw new ManualImportError('El archivo contiene una ruta no permitida.');
    return { entry, segments };
  });
  // A ZIP made from a folder wraps everything in that folder.
  const wrapped =
    normalized.length > 0 &&
    normalized.every(
      ({ segments }) => segments.length > 1 && segments[0] === normalized[0]!.segments[0],
    );
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const files: ProjectFile[] = [];
  const seen = new Set<string>();
  let declaredElements = new Map<string, string[]>();
  let skipped = 0;
  let total = 0;
  for (const { entry, segments } of normalized) {
    const parts = wrapped ? segments.slice(1) : segments;
    const path = parts.join('/');
    const name = parts.at(-1)!;
    const manifest = path === 'caseflow-manifest.json';
    if (
      !manifest &&
      (parts.some((segment) => SKIPPED_FOLDERS.has(segment)) ||
        SKIPPED_FILES.has(path) ||
        SKIPPED_DOCUMENTS.has(path) ||
        SKIPPED_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
        isEnvironmentFile(name))
    ) {
      skipped++;
      continue;
    }
    const bytes = await inflate(
      entry,
      path,
      Math.min(MANUAL_IMPORT_LIMITS.fileBytes, MANUAL_IMPORT_LIMITS.totalBytes - total),
    );
    total += bytes.length;
    let content: string;
    try {
      content = decoder.decode(bytes);
    } catch {
      throw new ManualImportError(`«${path}» no es un archivo de texto UTF-8.`);
    }
    if (content.includes('\0'))
      throw new ManualImportError(`«${path}» no es un archivo de texto UTF-8.`);
    if (manifest) {
      declaredElements = manifestElements(content);
      skipped++;
      continue;
    }
    if (seen.has(path)) throw new ManualImportError(`«${path}» aparece más de una vez.`);
    seen.add(path);
    files.push({ path, content, kind: kindOf(path) });
    if (files.length > MANUAL_IMPORT_LIMITS.files)
      throw new ManualImportError('El proyecto supera el número máximo de archivos.');
  }
  if (!files.length) throw new ManualImportError('El archivo no contiene archivos de proyecto.');
  return { files: files.sort((a, b) => a.path.localeCompare(b.path)), declaredElements, skipped };
}

// Inflates one entry without trusting its declared size: the stream is cut as
// soon as it passes the limit, so a decompression bomb is never held in memory.
export function inflate(entry: JSZip.JSZipObject, path: string, limit: number): Promise<Buffer> {
  const tooLarge = () => new ManualImportError(`«${path}» supera el tamaño máximo permitido.`);
  const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
    ?.uncompressedSize;
  if (typeof declared === 'number' && declared > limit) return Promise.reject(tooLarge());
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const stream = entry.nodeStream('nodebuffer') as unknown as Readable;
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        stream.destroy();
        reject(tooLarge());
      } else chunks.push(chunk);
    });
    stream.on('error', () => reject(new ManualImportError(`«${path}» no se pudo leer.`)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function manifestElements(content: string): Map<string, string[]> {
  const elements = new Map<string, string[]>();
  try {
    const links = (JSON.parse(content) as { traceLinks?: unknown }).traceLinks;
    if (!Array.isArray(links)) return elements;
    for (const link of links as { path?: unknown; planElement?: unknown }[]) {
      if (typeof link?.path !== 'string' || typeof link.planElement !== 'string') continue;
      const known = elements.get(link.path) ?? [];
      if (!known.includes(link.planElement)) known.push(link.planElement);
      elements.set(link.path, known);
    }
  } catch {
    // A broken manifest only loses the declared traceability.
  }
  return elements;
}
