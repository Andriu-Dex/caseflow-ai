import { UnauthorizedException } from '@nestjs/common';
import type { Response, Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController', () => {
  const service = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  };
  const controller = new AuthController(service as unknown as AuthService);
  const response = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
  const originalNodeEnv = process.env.NODE_ENV;

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
    await controller.register({} as never, response);
    process.env.NODE_ENV = 'production';
    await controller.login({} as never, response);

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
    expect(response.clearCookie).toHaveBeenCalledWith('refresh_token');
  });
});
