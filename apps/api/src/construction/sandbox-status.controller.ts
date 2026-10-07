import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { SandboxExecutionProvider } from '@caseflow-ai/integrations';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ApiZodResponse } from '../openapi/zod-openapi';
import { SANDBOX_EXECUTION_PROVIDER } from './sandbox-provider.token';

const sandboxStatusResponseSchema = z.object({ available: z.boolean() });

// Whether generated code can be validated on this machine. The desktop
// edition plans without Docker and shows the installation assistant to
// construct (DEC-117): this is what the assistant checks.
@ApiTags('construction')
@UseGuards(JwtAuthGuard)
@Controller('construction/sandbox-status')
export class SandboxStatusController {
  constructor(
    @Inject(SANDBOX_EXECUTION_PROVIDER) private readonly sandbox: SandboxExecutionProvider,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'getSandboxStatus', summary: 'Disponibilidad de Docker' })
  @ApiZodResponse(200, 'Sandbox status.', sandboxStatusResponseSchema)
  async status(): Promise<{ available: boolean }> {
    return { available: await this.sandbox.isAvailable() };
  }
}
