import { describe, expect, it } from 'vitest';
import type { MockupGenerationResult } from '@caseflow-ai/integrations';
import { StitchMockupProvider } from './stitch-mockup-provider';

const content = { screens: [] } as never;

describe('StitchMockupProvider', () => {
  it('requests a full-size Stitch screenshot while preserving URL parameters', () => {
    const provider = new StitchMockupProvider({ apiKey: 'test', timeoutMs: 100 });
    const fullResolutionImageUrl = (
      provider as unknown as {
        fullResolutionImageUrl: (
          url: string,
          width: unknown,
          device: 'DESKTOP' | 'MOBILE',
        ) => string;
      }
    ).fullResolutionImageUrl.bind(provider);

    expect(
      fullResolutionImageUrl('https://cdn.example/screen=w96-h512?token=abc', '1440', 'DESKTOP'),
    ).toBe('https://cdn.example/screen=w1600?token=abc');
    expect(fullResolutionImageUrl('https://cdn.example/screen', '390', 'MOBILE')).toBe(
      'https://cdn.example/screen=w780',
    );
    expect(fullResolutionImageUrl('https://cdn.example/screen', '99999', 'DESKTOP')).toBe(
      'https://cdn.example/screen=w1920',
    );
  });

  it('bounds the overall provider wait so fallback can proceed', async () => {
    const provider = new StitchMockupProvider({ apiKey: 'test', timeoutMs: 5 });
    (
      provider as unknown as { generateWithSdk: () => Promise<MockupGenerationResult> }
    ).generateWithSdk = () => new Promise(() => {});
    await expect(provider.generate(content)).rejects.toMatchObject({
      code: 'MOCKUP_PROVIDER_TIMEOUT',
    });
  });

  it('normalizes unexpected SDK failures without exposing them', async () => {
    const provider = new StitchMockupProvider({ apiKey: 'test', timeoutMs: 100 });
    (
      provider as unknown as { generateWithSdk: () => Promise<MockupGenerationResult> }
    ).generateWithSdk = async () => {
      throw new Error('secret SDK detail');
    };
    await expect(provider.generate(content)).rejects.toMatchObject({
      code: 'MOCKUP_PROVIDER_UNAVAILABLE',
      message: 'El proveedor de bocetos no está disponible.',
    });
  });
});
