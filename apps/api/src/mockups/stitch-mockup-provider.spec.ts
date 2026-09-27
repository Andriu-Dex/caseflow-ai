import { describe, expect, it } from 'vitest';
import type { MockupGenerationResult } from '@caseflow-ai/integrations';
import { StitchMockupProvider } from './stitch-mockup-provider';

const content = { screens: [] } as never;

describe('StitchMockupProvider', () => {
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
