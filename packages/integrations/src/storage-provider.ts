export const STORAGE_PROVIDER_ERROR_CODES = [
  'STORAGE_NOT_CONFIGURED',
  'STORAGE_OBJECT_NOT_FOUND',
  'STORAGE_PROVIDER_UNAVAILABLE',
  'STORAGE_PROVIDER_ERROR',
] as const;
export type StorageProviderErrorCode = (typeof STORAGE_PROVIDER_ERROR_CODES)[number];

export class StorageProviderError extends Error {
  constructor(
    public readonly code: StorageProviderErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'StorageProviderError';
  }
  toJSON(): { code: StorageProviderErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

// Product services never depend on SeaweedFS/AWS SDK details directly — only
// on this interface (spec §35, AGENTS.md §38).
export interface StorageProvider {
  readonly id: string;
  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<Buffer>;
}

export class DisabledStorageProvider implements StorageProvider {
  readonly id = 'disabled';
  async putObject(): Promise<never> {
    throw new StorageProviderError(
      'STORAGE_NOT_CONFIGURED',
      'El almacenamiento de objetos no está configurado.',
    );
  }
  async getObject(): Promise<never> {
    throw new StorageProviderError(
      'STORAGE_NOT_CONFIGURED',
      'El almacenamiento de objetos no está configurado.',
    );
  }
}

// For unit/integration tests that must not depend on a live object store.
export class FakeStorageProvider implements StorageProvider {
  readonly id = 'fake';
  private readonly objects = new Map<string, Buffer>();
  async putObject(input: PutObjectInput): Promise<void> {
    this.objects.set(input.key, input.body);
  }
  async getObject(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) throw new StorageProviderError('STORAGE_OBJECT_NOT_FOUND', 'El objeto no existe.');
    return object;
  }
}
