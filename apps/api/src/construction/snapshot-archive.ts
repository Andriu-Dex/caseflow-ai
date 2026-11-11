import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import JSZip from 'jszip';
import type { StorageProvider } from '@caseflow-ai/integrations';

const MAX_ARCHIVE_BYTES = 30_000_000;
const MAX_ENTRIES = 4000;

// The source files of an official snapshot, read from its private archive and
// checked against the recorded hash, without unsafe entries or oversize content.
export async function readSnapshotFiles(
  storage: StorageProvider,
  snapshot: { archiveStorageKey: string; archiveSha256: string; archiveSize: number },
): Promise<{ path: string; content: string }[]> {
  if (snapshot.archiveSize > MAX_ARCHIVE_BYTES) throw new Error('Snapshot archive too large.');
  const archive = await storage.getObject(snapshot.archiveStorageKey);
  if (createHash('sha256').update(archive).digest('hex') !== snapshot.archiveSha256)
    throw new Error('Snapshot hash mismatch.');
  const zip = await JSZip.loadAsync(archive);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_ENTRIES) throw new Error('Too many archive entries.');
  const roots = new Set(entries.map((entry) => entry.name.split('/')[0]));
  if (roots.size !== 1) throw new Error('Invalid archive root.');
  const files: { path: string; content: string }[] = [];
  let size = 0;
  for (const entry of entries) {
    // JSZip exposes the original name separately when it normalizes traversal.
    if (
      (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName !== entry.name ||
      (Number(entry.unixPermissions) & 0o170000) === 0o120000
    )
      throw new Error('Unsafe archive entry.');
    const chunks: Buffer[] = [];
    for await (const chunk of new Readable().wrap(entry.nodeStream())) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_ARCHIVE_BYTES) throw new Error('Expanded archive too large.');
      chunks.push(bytes);
    }
    files.push({
      path: entry.name.slice(entry.name.indexOf('/') + 1),
      content: Buffer.concat(chunks).toString('utf8'),
    });
  }
  return files;
}
