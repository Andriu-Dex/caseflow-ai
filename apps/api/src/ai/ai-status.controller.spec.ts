import { describe, expect, it } from 'vitest';
import { DisabledAIProvider, FakeAIProvider } from '@caseflow-ai/ai';
import { AIStatusController } from './ai-status.controller';

describe('AIStatusController', () => {
  it('reports whether AI generation is configured', () => {
    expect(new AIStatusController(new DisabledAIProvider()).status()).toEqual({ available: false });
    const fake = new FakeAIProvider({
      provider: 'fake',
      model: 'm',
      payload: {},
      usage: null,
      latencyMs: 1,
    });
    expect(new AIStatusController(fake).status()).toEqual({ available: true });
  });
});
