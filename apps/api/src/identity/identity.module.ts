import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JWT_SECRET } from './jwt-secret';
import { loadAuthRateLimitConfig } from './rate-limit/auth-rate-limit.config';
import {
  AUTH_RATE_LIMIT_CONFIG,
  AuthRateLimiter,
  RATE_LIMIT_STORE,
} from './rate-limit/auth-rate-limiter';
import { createRateLimitStore } from './rate-limit/rate-limit-store';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: '15m' }, // 15 minutes for access token
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AuthRateLimiter,
    { provide: AUTH_RATE_LIMIT_CONFIG, useFactory: () => loadAuthRateLimitConfig(process.env) },
    { provide: RATE_LIMIT_STORE, useFactory: () => createRateLimitStore(process.env) },
  ],
  exports: [AuthService, JwtModule],
})
export class IdentityModule {}
