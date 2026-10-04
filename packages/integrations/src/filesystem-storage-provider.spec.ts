import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilesystemStorageProvider } from './filesystem-storage-provider';

// Same contract as the S3 provider (DEC-120): round-trip, normalized errors.
describe('FilesystemStorageProvider', () => {
  let root: string;
  let storage: FilesystemStorageProvider;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'caseflow-storage-'));
    storage = new FilesystemStorageProvider(root);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it('round-trips a stored object under nested keys, leaving no partial files', async () => {
    await storage.putObject({
      key: 'sources/p1/a.pdf',
      body: Buffer.from('hola'),
      contentType: 'application/pdf',
    });
    expect((await storage.getObject('sources/p1/a.pdf')).toString()).toBe('hola');
    expect(await readdir(join(root, 'sources', 'p1'))).toEqual(['a.pdf']);
  });

  it('normalizes a missing object', async () => {
    await expect(storage.getObject('missing.png')).rejects.toMatchObject({
      code: 'STORAGE_OBJECT_NOT_FOUND',
    });
  });

  it('never reads or writes outside its root', async () => {
    for (const key of ['../escape.txt', '..\\escape.txt', '', '/etc/passwd'])
      await expect(
        storage.putObject({ key, body: Buffer.from('x'), contentType: 'text/plain' }),
      ).rejects.toMatchObject({ code: 'STORAGE_PROVIDER_ERROR' });
    await expect(storage.getObject('../../secret')).rejects.toMatchObject({
      code: 'STORAGE_PROVIDER_ERROR',
    });
  });
});
