import { Module } from '@nestjs/common';
import {
  AIOrchestrator,
  DisabledAIProvider,
  PromptRegistry,
  type AIProvider,
} from '@caseflow-ai/ai';
import { loadAIConfig } from '@caseflow-ai/config';
import { OpenAICompatibleProvider } from '@caseflow-ai/integrations';
import { PrismaAIRunRecorder } from './ai-run-recorder';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

@Module({
  providers: [
    PrismaAIRunRecorder,
    {
      provide: AI_PROVIDER,
      useFactory: (): AIProvider => {
        const config = loadAIConfig(process.env);
        return config.provider === 'disabled'
          ? new DisabledAIProvider()
          : new OpenAICompatibleProvider(config);
      },
    },
    { provide: PromptRegistry, useFactory: () => new PromptRegistry([]) },
    {
      provide: AIOrchestrator,
      inject: [AI_PROVIDER, PromptRegistry, PrismaAIRunRecorder],
      useFactory: (provider: AIProvider, prompts: PromptRegistry, recorder: PrismaAIRunRecorder) =>
        new AIOrchestrator(provider, prompts, recorder),
    },
  ],
  exports: [AIOrchestrator],
})
export class AIModule {}
