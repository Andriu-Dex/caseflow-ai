import { Controller, Post, Body, Res, Req, HttpCode, UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterRequest,
  LoginRequest,
  registerRequestSchema,
  loginRequestSchema,
  authResponseSchema,
} from '@caseflow-ai/contracts';
import { ApiZodResponse, ApiZodBody } from '../openapi/zod-openapi';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiZodBody(registerRequestSchema)
  @ApiZodResponse(201, 'User registered', authResponseSchema)
  async register(@Body() body: RegisterRequest, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...response } = await this.authService.register(body);
    this.setRefreshTokenCookie(res, refreshToken);
    return response;
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login a user' })
  @ApiZodBody(loginRequestSchema)
  @ApiZodResponse(200, 'User logged in', authResponseSchema)
  async login(@Body() body: LoginRequest, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...response } = await this.authService.login(body);
    this.setRefreshTokenCookie(res, refreshToken);
    return response;
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiZodResponse(200, 'Tokens refreshed', authResponseSchema)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refresh_token;
    if (!token) throw new UnauthorizedException('No refresh token');
    const { refreshToken, ...response } = await this.authService.refresh(token);
    this.setRefreshTokenCookie(res, refreshToken);
    return response;
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout a user' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refresh_token;
    if (token) {
      await this.authService.logout(token);
    }
    res.clearCookie('refresh_token');
    return { success: true };
  }

  private setRefreshTokenCookie(res: Response, token: string) {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
    });
  }
}
