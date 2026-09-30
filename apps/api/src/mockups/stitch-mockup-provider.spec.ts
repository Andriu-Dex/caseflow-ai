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

  it('passes the blueprint data and states to the visual generator', () => {
    const provider = new StitchMockupProvider({ apiKey: 'test', timeoutMs: 100 });
    const buildPrompt = (
      provider as unknown as {
        buildPrompt: (screen: unknown, device: 'DESKTOP') => string;
      }
    ).buildPrompt.bind(provider);
    const prompt = buildPrompt(
      {
        name: 'Pedidos',
        purpose: 'Registrar un pedido',
        targetActors: ['Vendedor'],
        sections: ['Productos'],
        primaryActions: ['Guardar'],
        secondaryActions: [],
        forms: ['Cantidad'],
        principalData: ['Precio total'],
        states: ['Error de validación'],
        relatedUseCaseCodes: ['CU-001'],
      },
      'DESKTOP',
    );
    expect(prompt).toContain('Precio total');
    expect(prompt).toContain('Error de validación');
    expect(prompt).toContain('CU-001');
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
