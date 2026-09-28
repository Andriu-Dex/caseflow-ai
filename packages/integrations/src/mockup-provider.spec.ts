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

  it('reports a failed provider before invoking the fallback', async () => {
    const error = new Error('Stitch timeout');
    const events: string[] = [];
    const failures: { id: string; error: unknown }[] = [];
    const chain = new FallbackMockupProvider(
      [
        new FakeMockupProvider(error),
        {
          id: 'internal',
          async generate() {
            events.push('fallback');
            return { kind: 'INTERNAL_WIREFRAME' as const, svg: '<svg/>' };
          },
        },
      ],
      (id, cause) => {
        events.push('failure');
        failures.push({ id, error: cause });
      },
    );
    await expect(chain.generate(content)).resolves.toMatchObject({ kind: 'INTERNAL_WIREFRAME' });
    expect(events).toEqual(['failure', 'fallback']);
    expect(failures).toEqual([{ id: 'fake', error }]);
  });

  it('reports failure only when all providers fail', async () => {
    const chain = new FallbackMockupProvider([
      new FakeMockupProvider(new Error('first')),
      new FakeMockupProvider(new Error('second')),
    ]);
    await expect(chain.generate(content)).rejects.toBeInstanceOf(MockupProviderError);
  });
});
