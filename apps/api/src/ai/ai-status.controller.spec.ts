import { describe, expect, it } from 'vitest';
import { DisabledAIProvider, FakeAIProvider, FallbackAIProvider } from '@caseflow-ai/ai';
import { AIStatusController } from './ai-status.controller';

describe('AIStatusController', () => {
  it('reports whether AI generation is configured', async () => {
    await expect(new AIStatusController(new DisabledAIProvider()).status()).resolves.toEqual({
      available: false,
      providers: [],
    });
    const fake = new FakeAIProvider({
      provider: 'fake',
      model: 'm',
      payload: {},
      usage: null,
      latencyMs: 1,
    });
    await expect(new AIStatusController(fake).status()).resolves.toEqual({
      available: true,
      providers: [{ id: 'fake' }],
    });
  });

  it('reports each provider of a chain, with what it takes (DEC-127)', async () => {
    const fake = new FakeAIProvider({
      provider: 'fake',
      model: 'm',
      payload: {},
      usage: null,
      latencyMs: 1,
    });
    const chain = new FallbackAIProvider([
      { provider: fake, capacity: { tokensPerMinute: 8_000 } },
    ]);
    await expect(new AIStatusController(chain).status()).resolves.toEqual({
      available: true,
      providers: [{ id: 'fake', maxInputTokens: 8_000 }],
    });
  });

  it('reports and lifts the usage-limit pause of the ChatGPT plan (DEC-117)', async () => {
    let paused = true;
    const plan = {
      id: 'chatgpt',
      generateStructured: async () => {
        throw new Error('unused');
      },
      planPaused: async () => paused,
      resumePlan: async () => {
        paused = false;
      },
    };
    const controller = new AIStatusController(plan as never);
    await expect(controller.status()).resolves.toMatchObject({ planPaused: true });
    await controller.resumePlan();
    await expect(controller.status()).resolves.toMatchObject({ planPaused: false });
  });
});
