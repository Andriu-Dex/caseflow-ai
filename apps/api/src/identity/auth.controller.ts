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
import { ApiErrorResponse, ApiZodResponse, ApiZodBody } from '../openapi/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { REFRESH_COOKIE_NAME, clearRefreshCookie, setRefreshCookie } from './refresh-cookie';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiZodBody(registerRequestSchema)
  @ApiZodResponse(201, 'User registered', authResponseSchema)
  @ApiErrorResponse(400, 'The request body is invalid.')
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...response } = await this.authService.register(body);
    setRefreshCookie(res, refreshToken);
    return response;
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login a user' })
  @ApiZodBody(loginRequestSchema)
  @ApiZodResponse(200, 'User logged in', authResponseSchema)
  @ApiErrorResponse(400, 'The request body is invalid.')
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...response } = await this.authService.login(body);
    setRefreshCookie(res, refreshToken);
    return response;
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiZodResponse(200, 'Tokens refreshed', authResponseSchema)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) throw new UnauthorizedException('No refresh token');
    const { refreshToken, ...response } = await this.authService.refresh(token);
    setRefreshCookie(res, refreshToken);
    return response;
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout a user' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (token) {
      await this.authService.logout(token);
    }
    clearRefreshCookie(res);
    return { success: true };
  }
}
