import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { PutObjectInput, StorageProvider } from './storage-provider';
import { StorageProviderError } from './storage-provider';

export interface S3StorageProviderConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

// The local SeaweedFS S3 gateway (or any other S3-compatible endpoint
// configured via S3_ENDPOINT) — never a hardcoded provider. forcePathStyle
// is required for path-style S3-compatible services such as SeaweedFS/MinIO.
export class S3StorageProvider implements StorageProvider {
  readonly id = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageProviderConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putObject(input: PutObjectInput): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
    } catch (cause) {
      throw normalizeError(cause);
    }
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = response.Body;
      if (!body) throw new StorageProviderError('STORAGE_OBJECT_NOT_FOUND', 'El objeto no existe.');
      return Buffer.from(await body.transformToByteArray());
    } catch (cause) {
      throw normalizeError(cause);
    }
  }
}

function normalizeError(cause: unknown): StorageProviderError {
  if (cause instanceof StorageProviderError) return cause;
  if (cause instanceof NoSuchKey)
    return new StorageProviderError('STORAGE_OBJECT_NOT_FOUND', 'El objeto no existe.', {
      cause,
    });
  if (
    cause instanceof S3ServiceException &&
    cause.$fault === 'client' &&
    cause.$metadata.httpStatusCode === 404
  )
    return new StorageProviderError('STORAGE_OBJECT_NOT_FOUND', 'El objeto no existe.', {
      cause,
    });
  return new StorageProviderError(
    'STORAGE_PROVIDER_UNAVAILABLE',
    'El almacenamiento de objetos no está disponible.',
    { cause },
  );
}
