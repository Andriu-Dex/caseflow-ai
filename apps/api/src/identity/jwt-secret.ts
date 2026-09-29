import { randomBytes } from 'crypto';

const configuredSecret = process.env.JWT_SECRET;
if (
  process.env.NODE_ENV === 'production' &&
  (!configuredSecret ||
    configuredSecret.length < 32 ||
    configuredSecret.startsWith('replace-with-'))
) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
}

// A process-local secret keeps local development convenient without shipping a
// known signing key. Restarting the API invalidates local access tokens.
export const JWT_SECRET = configuredSecret ?? randomBytes(48).toString('hex');
