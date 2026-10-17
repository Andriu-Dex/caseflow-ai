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
        buildPrompt: (screen: unknown, device: 'DESKTOP', refinement?: string) => string;
      }
    ).buildPrompt.bind(provider);
    const screen = {
      name: 'Pedidos',
      purpose: 'Registrar un pedido',
      targetActors: [],
      sections: [],
      primaryActions: [],
      secondaryActions: [],
      forms: [],
      principalData: [],
      states: [],
      relatedUseCaseCodes: [],
    };
    expect(buildPrompt(screen, 'DESKTOP')).not.toContain('Ajustes solicitados');
    const refined = buildPrompt(screen, 'DESKTOP', 'Usa tonos verdes');
    expect(refined).toContain('Registrar un pedido');
    expect(refined.endsWith('Usa tonos verdes')).toBe(true);
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

  it('asks Stitch to use the approved palette (DEC-118)', () => {
    const provider = new StitchMockupProvider({ apiKey: 'test', timeoutMs: 100 });
    const buildPrompt = (
      provider as unknown as {
        buildPrompt: (
          screen: unknown,
          device: 'DESKTOP',
          refinement?: string,
          theme?: unknown,
        ) => string;
      }
    ).buildPrompt.bind(provider);
    const screen = {
      name: 'Pedidos',
      purpose: 'Registrar un pedido',
      targetActors: [],
      sections: [],
      primaryActions: [],
      secondaryActions: [],
      forms: [],
      principalData: [],
      states: [],
      relatedUseCaseCodes: [],
    };
    const dark = {
      background: '#101010',
      foreground: '#fafafa',
      primary: '#0e7490',
      primaryForeground: '#f0f9ff',
      secondary: '#262626',
      secondaryForeground: '#e5e5e5',
      accent: '#a16207',
      accentForeground: '#fffbeb',
      muted: '#171717',
      mutedForeground: '#a3a3a3',
      destructive: '#f87171',
      destructiveForeground: '#101010',
      border: '#404040',
    };
    const prompt = buildPrompt(screen, 'DESKTOP', undefined, { name: 'Noche', mode: 'DARK', dark });
    expect(prompt).toContain('modo oscuro');
    expect(prompt).toContain('color primario #0e7490 con texto #f0f9ff');
    expect(buildPrompt(screen, 'DESKTOP')).not.toContain('paleta');
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

  it('tells Stitch to keep the rest of the screen when editing it', () => {
    const provider = new StitchMockupProvider({ apiKey: 'test', timeoutMs: 100 });
    const buildEditPrompt = (
      provider as unknown as { buildEditPrompt: (prompt: string) => string }
    ).buildEditPrompt.bind(provider);
    const prompt = buildEditPrompt('Usa tonos verdes');
    expect(prompt).toContain('conserva el resto del diseño');
    expect(prompt.endsWith('Usa tonos verdes')).toBe(true);
  });

  it('bounds a screen edit and hides SDK failures behind a safe message', async () => {
    const provider = new StitchMockupProvider({ apiKey: 'test', timeoutMs: 5 });
    const withTimeout = (
      provider as unknown as {
        withTimeout: (run: () => Promise<unknown>, t: string, u: string) => Promise<unknown>;
      }
    ).withTimeout.bind(provider);
    await expect(withTimeout(() => new Promise(() => {}), 'lento', 'caído')).rejects.toMatchObject({
      code: 'MOCKUP_PROVIDER_TIMEOUT',
      message: 'lento',
    });
    await expect(
      withTimeout(
        async () => {
          throw new Error('secret SDK detail');
        },
        'lento',
        'caído',
      ),
    ).rejects.toMatchObject({ code: 'MOCKUP_PROVIDER_UNAVAILABLE', message: 'caído' });
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

describe('StitchMockupProvider screen by screen (DEC-146)', () => {
  it('bounds each screen by its own time limit and reports it by name', async () => {
    const provider = new StitchMockupProvider({ apiKey: 'test', timeoutMs: 20 });
    // The SDK call never answers: only the per-screen limit ends it.
    (provider as unknown as { sdk: () => Promise<unknown> }).sdk = async () => ({
      project: () => ({ generate: () => new Promise(() => undefined) }),
    });
    await expect(
      provider.screens.generateScreen(
        'p1',
        {
          localId: 'a',
          name: 'Pedidos',
          purpose: 'Registrar',
          targetActors: [],
          sections: [],
          primaryActions: [],
          secondaryActions: [],
          forms: [],
          principalData: [],
          states: [],
          relatedUseCaseCodes: [],
        },
        'DESKTOP',
      ),
    ).rejects.toMatchObject({
      code: 'MOCKUP_PROVIDER_TIMEOUT',
      message: 'La pantalla «Pedidos» excedió el tiempo límite.',
    });
  });
  it('creates the provider project the screens of one mockup go to', async () => {
    const provider = new StitchMockupProvider({ apiKey: 'test', timeoutMs: 1000 });
    (provider as unknown as { sdk: () => Promise<unknown> }).sdk = async () => ({
      createProject: async (title: string) => ({ id: `id-${title}` }),
    });
    await expect(provider.screens.createProject('X')).resolves.toBe('id-X');
  });
});
