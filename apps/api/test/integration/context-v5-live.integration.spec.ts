import { describe, expect, it } from 'vitest';
import { loadAIConfig } from '@caseflow-ai/config';
import { ChatGPTProvider, HttpChatGPTBroker } from '@caseflow-ai/integrations';
import { createTestContext, createWorkspace } from './support/test-app';

// Explicit live evaluation only. Normal CI never calls an external model.
describe.skipIf(process.env.CASEFLOW_LIVE_AI !== '1')('Live ChatGPT context v5 evaluation', () => {
  it('describes the software and keeps project activities out of its capabilities', async () => {
    const config = loadAIConfig({ ...process.env, AI_PROVIDER: 'chatgpt' });
    if (config.provider !== 'chatgpt')
      throw new Error('Connect ChatGPT before running this evaluation.');
    const provider = new ChatGPTProvider({
      model: config.model,
      timeoutMs: config.timeoutMs,
      maxOutputTokens: config.maxOutputTokens,
      broker: new HttpChatGPTBroker(config.brokerUrl, config.brokerSecret),
    });
    const ctx = await createTestContext({ aiProvider: provider });
    try {
      const workspace = await createWorkspace(ctx.prisma, 'Live context evaluation');
      const project = await ctx.projects.create({
        workspaceId: workspace.id,
        name: 'Préstamo de equipos — evaluación v5',
      });
      const source = await ctx.sources.create(
        project.id,
        {
          title: 'Descripción del sistema',
          sourceKind: 'TEXT',
          purpose: 'Validar contexto del producto',
          description:
            'La aplicación registra préstamos de equipos deportivos. El encargado registra equipos y préstamos, entrega equipos y registra devoluciones. El administrador gestiona usuarios y consulta el historial. El director y el asesor son interesados que no usan el software. El alumno recibe equipos del encargado pero no tiene acceso a la aplicación. Cada préstamo exige identificación del alumno y fecha de devolución; no se presta un equipo ya prestado. Solo administradores pueden gestionar usuarios. Debe conservarse auditoría de todas las entregas y devoluciones durante un año. La interfaz será responsive. Fuera de alcance: pagos y reservas en línea. El proyecto incluye capacitación del personal, un piloto y tres fases de desarrollo y pruebas. Esas actividades las realiza el equipo de desarrollo y no son funciones del sistema.',
        },
        undefined,
      );
      await ctx.sources.transition(project.id, source.id, source.version.id, 'IN_REVIEW');
      await ctx.sources.transition(project.id, source.id, source.version.id, 'APPROVED');
      const result = await ctx.projectContext.generate(project.id);
      console.log('LIVE_CONTEXT_V5', JSON.stringify(result.content));
      expect(result.content.actors.map((actor) => actor.name).join(' ')).not.toMatch(
        /director|asesor|alumno|equipo de desarrollo/i,
      );
      const product = [
        ...result.content.needs,
        ...result.content.businessRules,
        ...result.content.constraints,
      ].join(' ');
      expect(product).not.toMatch(/capacitación|piloto|fase de desarrollo|fases de desarrollo/i);
      expect(product).toMatch(/auditoría/i);
      expect(result.content.additionalContext ?? '').not.toMatch(
        /^\s*(esta|la|esta es una) (propuesta|borrador)/i,
      );
    } finally {
      await ctx.close();
    }
  }, 300_000);
});
