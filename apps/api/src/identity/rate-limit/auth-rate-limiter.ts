import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JWT_SECRET } from '../jwt-secret';
import type { AuthRateLimit, AuthRateLimitConfig } from './auth-rate-limit.config';
import { accountKey, clientAddressKey } from './client-key';
import type { RateLimitHit, RateLimitStore } from './rate-limit-store';

export const AUTH_RATE_LIMIT_CONFIG = Symbol('AUTH_RATE_LIMIT_CONFIG');
export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

export type AuthAction = 'login' | 'register' | 'refresh';

// What the caller keeps from an attempt that was let through.
export interface AuthAttempt {
  // The credentials were right: the account's own count starts again.
  succeeded(): Promise<void>;
}

const NO_OP: AuthAttempt = { succeeded: async () => undefined };

function wait(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

// Limits on the attempts that can be abused (sign-in, registration, refreshing a
// session). Counts are kept per address, and for sign-in also per address and
// account, never per account alone: someone who fails 10 times from their own
// address must not be able to lock the owner out from theirs.
@Injectable()
export class AuthRateLimiter implements OnModuleDestroy {
  private readonly logger = new Logger(AuthRateLimiter.name);

  constructor(
    @Inject(AUTH_RATE_LIMIT_CONFIG) private readonly config: AuthRateLimitConfig,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.store.close();
  }

  // Counts the attempt before it is handled, so concurrent requests cannot all
  // slip under the limit. Throws 429 with Retry-After once it is exceeded.
  async consume(
    action: AuthAction,
    req: Request,
    res: Response,
    email?: string,
  ): Promise<AuthAttempt> {
    if (!this.config.enabled) return NO_OP;
    try {
      const address = clientAddressKey(req.ip);
      const perAddress = this.perAddress(action);
      const addressHit = await this.store.hit(
        `${action}:address:${address}`,
        perAddress.windowSeconds * 1000,
      );
      this.assertWithin(addressHit, perAddress, res);

      if (action !== 'login' || !email) return NO_OP;
      const key = `login:account:${address}:${accountKey(email, JWT_SECRET)}`;
      const { loginPerAccount } = this.config;
      const accountHit = await this.store.hit(key, loginPerAccount.windowSeconds * 1000);
      this.assertWithin(accountHit, loginPerAccount, res);
      return { succeeded: () => this.store.reset(key).catch(() => undefined) };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // The limiter failing must not stop people signing in.
      this.logger.warn(
        `Rate limiting skipped: ${error instanceof Error ? error.message : 'unknown error'}.`,
      );
      return NO_OP;
    }
  }

  private perAddress(action: AuthAction): AuthRateLimit {
    if (action === 'login') return this.config.loginPerAddress;
    return action === 'register' ? this.config.registerPerAddress : this.config.refreshPerAddress;
  }

  private assertWithin(hit: RateLimitHit, limit: AuthRateLimit, res: Response): void {
    if (hit.count <= limit.max) return;
    const seconds = Math.max(1, Math.ceil(hit.resetInMs / 1000));
    res.setHeader('Retry-After', String(seconds));
    throw new HttpException(
      {
        message: `Demasiados intentos. Vuelva a intentarlo en ${wait(seconds)}.`,
        error: 'Too Many Requests',
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
