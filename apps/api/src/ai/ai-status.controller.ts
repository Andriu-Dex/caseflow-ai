import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AIProvider } from '@caseflow-ai/ai';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ApiZodResponse } from '../openapi/zod-openapi';
import { AI_PROVIDER } from './ai-provider.token';

const aiStatusResponseSchema = z.object({ available: z.boolean() });

// Whether AI generation is configured at all. The EXPRESS and BUILD_ONLY
// routes depend on it entirely, so the web warns before creating one.
@ApiTags('ai')
@UseGuards(JwtAuthGuard)
@Controller('ai/status')
export class AIStatusController {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AIProvider) {}

  @Get()
  @ApiOperation({ operationId: 'getAIStatus', summary: 'Disponibilidad de la IA' })
  @ApiZodResponse(200, 'AI status.', aiStatusResponseSchema)
  status(): { available: boolean } {
    return { available: this.provider.id !== 'disabled' };
  }
}
