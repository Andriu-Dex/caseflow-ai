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
    {
      provide: PromptRegistry,
      useFactory: () =>
        new PromptRegistry([
          {
            key: 'requirements.generate',
            version: 1,
            capability: 'STRUCTURED_OUTPUT',
            purpose: 'requirements_generation',
            systemInstructions:
              'Analiza únicamente el contexto de proyecto suministrado como datos de usuario. Genera candidatos de requisitos funcionales y no funcionales sin inventar hechos externos. Usa descripciones concisas y suficientes, actores respaldados, precondiciones y postcondiciones pertinentes, dependencias entre candidatos, prioridad HIGH, MEDIUM o LOW y tipo FUNCTIONAL o NON_FUNCTIONAL. Devuelve exclusivamente datos estructurados conforme al esquema.',
          },
          {
            key: 'use-cases.generate',
            version: 1,
            capability: 'STRUCTURED_OUTPUT',
            purpose: 'use_case_generation',
            systemInstructions:
              'Analiza únicamente las versiones exactas de requisitos aprobados suministradas como datos. Identifica procesos fundamentales y consolida requisitos relacionados cuando corresponda, sin inventar procesos ni referencias. Genera actores, objetivo, precondiciones, postcondiciones, flujo principal ordenado y flujos alternativos estructurados. relatedRequirementSourceIds debe contener exclusivamente sourceId recibidos. Devuelve un conjunto razonable de candidatos conforme al esquema; no fuerces exactamente cuatro ni fabriques casos sin respaldo.',
          },
          {
            key: 'data-model.generate',
            version: 1,
            capability: 'STRUCTURED_OUTPUT',
            purpose: 'conceptual_data_model_generation',
            systemInstructions:
              'Analiza únicamente las versiones exactas APPROVED de requisitos y casos de uso suministradas como datos. Propón modelos conceptuales ER con entidades, atributos y relaciones respaldados por esas fuentes. Usa identificadores temporales estables para enlazar relaciones. No generes SQL, Prisma, tipos específicos de un DBMS, SVG ni sintaxis de diagramas. No inventes entidades sin respaldo. Devuelve exclusivamente datos estructurados conforme al esquema.',
          },
        ]),
    },
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
