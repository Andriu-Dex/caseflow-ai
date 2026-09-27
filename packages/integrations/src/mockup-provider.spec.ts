import { describe, expect, it } from 'vitest';
import { FakeMockupProvider, FallbackMockupProvider, MockupProviderError } from './mockup-provider';

const content = { screens: [] } as never;

describe('FallbackMockupProvider', () => {
  it('returns the first successful result', async () => {
    await expect(
      new FallbackMockupProvider([new FakeMockupProvider()]).generate(content),
    ).resolves.toMatchObject({ kind: 'INTERNAL_WIREFRAME' });
  });

  it('uses the next provider after a failure', async () => {
    const chain = new FallbackMockupProvider([
      new FakeMockupProvider(new Error('offline')),
      new FakeMockupProvider(),
    ]);
    await expect(chain.generate(content)).resolves.toMatchObject({ kind: 'INTERNAL_WIREFRAME' });
  });

  it('reports failure only when all providers fail', async () => {
    const chain = new FallbackMockupProvider([
      new FakeMockupProvider(new Error('first')),
      new FakeMockupProvider(new Error('second')),
    ]);
    await expect(chain.generate(content)).rejects.toBeInstanceOf(MockupProviderError);
  });
});
