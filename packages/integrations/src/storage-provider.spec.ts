import { describe, expect, it } from 'vitest';
import {
  DisabledStorageProvider,
  FakeStorageProvider,
  StorageProviderError,
  type StorageProvider,
} from './index';

describe('FakeStorageProvider', () => {
  it('round-trips a stored object', async () => {
    const storage = new FakeStorageProvider();
    await storage.putObject({
      key: 'a/b.pdf',
      body: Buffer.from('hello'),
      contentType: 'application/pdf',
    });
    expect((await storage.getObject('a/b.pdf')).toString()).toBe('hello');
  });
  it('normalizes a missing object', async () => {
    const storage = new FakeStorageProvider();
    await expect(storage.getObject('missing')).rejects.toMatchObject({
      code: 'STORAGE_OBJECT_NOT_FOUND',
    });
  });
});

describe('DisabledStorageProvider', () => {
  it('rejects every operation with STORAGE_NOT_CONFIGURED', async () => {
    const storage: StorageProvider = new DisabledStorageProvider();
    await expect(
      storage.putObject({ key: 'x', body: Buffer.from(''), contentType: 'text/plain' }),
    ).rejects.toBeInstanceOf(StorageProviderError);
    await expect(storage.getObject('x')).rejects.toMatchObject({ code: 'STORAGE_NOT_CONFIGURED' });
  });
});
