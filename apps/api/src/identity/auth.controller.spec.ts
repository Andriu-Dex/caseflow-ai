import { UnauthorizedException } from '@nestjs/common';
import type { Response, Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { AuthRateLimiter } from './rate-limit/auth-rate-limiter';

describe('AuthController', () => {
  const service = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  };
  const succeeded = vi.fn();
  const limiter = { consume: vi.fn() };
  const controller = new AuthController(
    service as unknown as AuthService,
    limiter as unknown as AuthRateLimiter,
  );
  const request = { ip: '203.0.113.7', cookies: {} } as unknown as Request;
  const response = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    limiter.consume.mockResolvedValue({ succeeded });
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('sets a non-readable refresh cookie on registration and login', async () => {
    service.register.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: {},
    });
    service.login.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', user: {} });
    process.env.NODE_ENV = 'development';
    await controller.register({} as never, request, response);
    process.env.NODE_ENV = 'production';
    await controller.login({ email: 'ana@example.com', password: 'x' }, request, response);

    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', path: '/auth' }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh',
      expect.objectContaining({ secure: false }),
    );
  });

  it('counts a registration attempt before handling it', async () => {
    service.register.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} });
    await controller.register({} as never, request, response);
    expect(limiter.consume).toHaveBeenCalledWith('register', request, response);
  });

  it('counts a sign-in attempt by account and resets the count only when it succeeds', async () => {
    service.login.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} });
    await controller.login({ email: 'ana@example.com', password: 'x' }, request, response);
    expect(limiter.consume).toHaveBeenCalledWith('login', request, response, 'ana@example.com');
    expect(succeeded).toHaveBeenCalledTimes(1);

    succeeded.mockClear();
    service.login.mockRejectedValue(new UnauthorizedException('Invalid credentials'));
    await expect(
      controller.login({ email: 'ana@example.com', password: 'bad' }, request, response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(succeeded).not.toHaveBeenCalled();
  });

  it('does not reach the service when the limiter refuses the attempt', async () => {
    limiter.consume.mockRejectedValue(new Error('429'));
    await expect(
      controller.login({ email: 'ana@example.com', password: 'x' }, request, response),
    ).rejects.toThrow('429');
    expect(service.login).not.toHaveBeenCalled();
  });

  it('requires a refresh cookie and rotates it when present', async () => {
    await expect(
      controller.refresh({ cookies: {} } as unknown as Request, response),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    service.refresh.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      user: {},
    });
    await expect(
      controller.refresh(
        { cookies: { refresh_token: 'old-refresh' } } as unknown as Request,
        response,
      ),
    ).resolves.toEqual({ accessToken: 'new-access', user: {} });
    expect(service.refresh).toHaveBeenCalledWith('old-refresh');
  });

  it('revokes a supplied refresh cookie and always clears it on logout', async () => {
    service.logout.mockResolvedValue(undefined);
    await controller.logout({ cookies: {} } as unknown as Request, response);
    expect(service.logout).not.toHaveBeenCalled();

    await controller.logout(
      { cookies: { refresh_token: 'refresh' } } as unknown as Request,
      response,
    );
    expect(service.logout).toHaveBeenCalledWith('refresh');
    // Cleared with the attributes it was created with (Path included), not the defaults.
    expect(response.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/auth' }),
    );
  });
});
