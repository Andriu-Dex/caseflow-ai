import { describe, expect, it } from 'vitest';
import { DisabledAIProvider, FakeAIProvider, FallbackAIProvider } from '@caseflow-ai/ai';
import { AIStatusController } from './ai-status.controller';

describe('AIStatusController', () => {
  it('reports whether AI generation is configured', () => {
    expect(new AIStatusController(new DisabledAIProvider()).status()).toEqual({
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
    expect(new AIStatusController(fake).status()).toEqual({
      available: true,
      providers: [{ id: 'fake' }],
    });
  });

  it('reports each provider of a chain, with what it takes (DEC-127)', () => {
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
    expect(new AIStatusController(chain).status()).toEqual({
      available: true,
      providers: [{ id: 'fake', maxInputTokens: 8_000 }],
    });
  });
});
