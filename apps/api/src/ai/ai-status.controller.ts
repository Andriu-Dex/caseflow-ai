import { Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AIProvider } from '@caseflow-ai/ai';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ApiZodResponse } from '../openapi/zod-openapi';
import { AI_PROVIDER } from './ai-provider.token';

const aiStatusResponseSchema = z.object({
  available: z.boolean(),
  // DEC-127: what each configured provider can take now, and any spent quota.
  providers: z.array(
    z.object({
      id: z.string(),
      maxInputTokens: z.number().int().optional(),
      unavailableUntil: z.iso.datetime().optional(),
      quota: z.enum(['MINUTE', 'DAY']).optional(),
    }),
  ),
  // The ChatGPT plan is paused after reaching its usage limit (DEC-117).
  planPaused: z.boolean().optional(),
});
type AIStatusResponse = z.infer<typeof aiStatusResponseSchema>;

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
  async status(): Promise<AIStatusResponse> {
    if (this.provider.id === 'disabled') return { available: false, providers: [] };
    const plan = this.plan();
    return {
      available: true,
      ...(plan ? { planPaused: await plan.planPaused() } : {}),
      providers: this.provider.status?.() ?? [
        {
          id: this.provider.id,
          ...(this.provider.maxInputTokens ? { maxInputTokens: this.provider.maxInputTokens } : {}),
        },
      ],
    };
  }

  // The person checked the usage in ChatGPT and decides to try again. Every
  // edition with the plan runs on the person's own machine (DEC-117, DEC-128).
  @Post('resume-plan')
  @HttpCode(204)
  @ApiOperation({ operationId: 'resumeAIPlan', summary: 'Reanudar el plan de ChatGPT' })
  async resumePlan(): Promise<void> {
    await this.plan()?.resumePlan();
  }

  private plan() {
    const provider = this.provider as Partial<{
      planPaused(): Promise<boolean>;
      resumePlan(): Promise<void>;
    }>;
    return provider.planPaused && provider.resumePlan
      ? (provider as { planPaused(): Promise<boolean>; resumePlan(): Promise<void> })
      : undefined;
  }
}
