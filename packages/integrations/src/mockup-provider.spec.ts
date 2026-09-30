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

  it('edits a screen only through the provider that supports it, never falling back', async () => {
    const ref = { projectId: 'p', screenId: 's' };
    const edited = {
      image: { body: Buffer.from('png'), contentType: 'image/png' },
      html: '<html></html>',
      providerRef: { projectId: 'p', screenId: 's2' },
    };
    const calls: unknown[] = [];
    const chain = new FallbackMockupProvider([
      {
        id: 'stitch',
        generate: async () => ({ kind: 'STITCH' as const, screens: [] }),
        editScreen: async (...args) => {
          calls.push(args);
          return edited;
        },
      },
      new FakeMockupProvider(),
    ]);
    await expect(chain.editScreen(ref, 'verde', 'MOBILE')).resolves.toBe(edited);
    expect(calls).toEqual([[ref, 'verde', 'MOBILE']]);

    await expect(
      new FallbackMockupProvider([new FakeMockupProvider()]).editScreen(ref, 'verde'),
    ).rejects.toMatchObject({ code: 'MOCKUP_NOT_CONFIGURED' });

    const failing = new FallbackMockupProvider([
      {
        id: 'stitch',
        generate: async () => ({ kind: 'STITCH' as const, screens: [] }),
        editScreen: async () => {
          throw new Error('secret detail');
        },
      },
    ]);
    await expect(failing.editScreen(ref, 'verde')).rejects.toMatchObject({
      code: 'MOCKUP_PROVIDER_ERROR',
      message: 'No se pudo editar la pantalla.',
    });
  });

  it('reports failure only when all providers fail', async () => {
    const chain = new FallbackMockupProvider([
      new FakeMockupProvider(new Error('first')),
      new FakeMockupProvider(new Error('second')),
    ]);
    await expect(chain.generate(content)).rejects.toBeInstanceOf(MockupProviderError);
  });
});
