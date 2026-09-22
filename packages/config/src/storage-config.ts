import { z } from 'zod';

const storageSchema = z.object({
  S3_ENDPOINT: z.url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_REGION: z.string().min(1),
});

export type StorageConfig =
  | { configured: false }
  | {
      configured: true;
      endpoint: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      region: string;
    };

// Object storage is required local infrastructure for source uploads (like
// PostgreSQL/Kroki), but booting the API without it configured must not
// crash the whole process — only an actual upload/download attempt fails
// (DisabledStorageProvider), consistent with the diagram renderer pattern.
export function loadStorageConfig(environment: NodeJS.ProcessEnv): StorageConfig {
  const parsed = storageSchema.safeParse(environment);
  if (!parsed.success) return { configured: false };
  return {
    configured: true,
    endpoint: parsed.data.S3_ENDPOINT,
    bucket: parsed.data.S3_BUCKET,
    accessKeyId: parsed.data.S3_ACCESS_KEY_ID,
    secretAccessKey: parsed.data.S3_SECRET_ACCESS_KEY,
    region: parsed.data.S3_REGION,
  };
}
