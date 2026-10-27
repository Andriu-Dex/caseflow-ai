import { describe, expect, it, vi } from 'vitest';
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
      fullResolutionImageUrl(
        'https://lh3.googleusercontent.com/screen=w96-h512?token=abc',
        '1440',
        'DESKTOP',
      ),
    ).toBe('https://lh3.googleusercontent.com/screen=w1600?token=abc');
    expect(
      fullResolutionImageUrl('https://lh3.googleusercontent.com/screen', '390', 'MOBILE'),
    ).toBe('https://lh3.googleusercontent.com/screen=w780');
    expect(
      fullResolutionImageUrl('https://lh3.googleusercontent.com/screen', '99999', 'DESKTOP'),
    ).toBe('https://lh3.googleusercontent.com/screen=w1920');
    const apiUrl = 'https://stitch.googleapis.com/v1/projects/p/screens/s/image?alt=media';
    expect(fullResolutionImageUrl(apiUrl, 1920, 'DESKTOP')).toBe(apiUrl);
    expect(fullResolutionImageUrl('https://cdn.example/screen', 1920, 'DESKTOP')).toBe(
      'https://cdn.example/screen',
    );
  });

  it('authenticates only the official API origin and drops credentials on redirects', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://cdn.example/asset.png' } }),
      )
      .mockResolvedValueOnce(new Response('image', { headers: { 'content-type': 'image/png' } }));
    const provider = new StitchMockupProvider({
      apiKey: 'test-key',
      timeoutMs: 1000,
      fetch: fetcher,
    });
    const download = (
      provider as unknown as { download(url: string, kind: 'image'): Promise<unknown> }
    ).download.bind(provider);
    await expect(
      download('https://stitch.googleapis.com/v1/asset', 'image'),
    ).resolves.toBeDefined();
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      redirect: 'manual',
      headers: { 'x-goog-api-key': 'test-key' },
    });
    expect(fetcher.mock.calls[1]![1]).not.toHaveProperty('headers');
    fetcher.mockResolvedValueOnce(
      new Response('image', { headers: { 'content-type': 'image/png' } }),
    );
    await download('https://stitch.googleapis.com.evil.example/asset', 'image');
    expect(fetcher.mock.calls[2]![1]).not.toHaveProperty('headers');
  });

  it('refuses insecure redirects and redirect loops without forwarding credentials', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'http://cdn.example/asset' } }),
      );
    const provider = new StitchMockupProvider({
      apiKey: 'test-key',
      timeoutMs: 1000,
      fetch: fetcher,
    });
    const download = (
      provider as unknown as { download(url: string, kind: 'image'): Promise<unknown> }
    ).download.bind(provider);
    await expect(download('https://stitch.googleapis.com/v1/asset', 'image')).rejects.toMatchObject(
      { code: 'MOCKUP_PROVIDER_ERROR' },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher
      .mockClear()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: '/loop' } }));
    await expect(download('https://stitch.googleapis.com/v1/asset', 'image')).rejects.toMatchObject(
      { code: 'MOCKUP_PROVIDER_ERROR' },
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('decodes authenticated REST image and HTML envelopes without accepting arbitrary JSON', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const html = '<!doctype html><html><body>Biblioteca</body></html>';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ dataString: png.toString('base64'), imageMetadata: { mimeType: 'PNG' } }),
      )
      .mockResolvedValueOnce(Response.json({ dataString: html }))
      .mockResolvedValueOnce(Response.json({ dataString: Buffer.from(html).toString('base64') }));
    const provider = new StitchMockupProvider({
      apiKey: 'test-key',
      timeoutMs: 1000,
      fetch: fetcher,
    });
    const download = (
      provider as unknown as {
        download(
          url: string,
          kind: 'image' | 'html',
        ): Promise<{ body: Buffer; contentType: string }>;
      }
    ).download.bind(provider);
    await expect(download('https://stitch.googleapis.com/v1/asset', 'image')).resolves.toEqual({
      body: png,
      contentType: 'image/png',
    });
    await expect(download('https://stitch.googleapis.com/v1/asset', 'html')).resolves.toEqual({
      body: Buffer.from(html),
      contentType: 'text/html',
    });
    await expect(download('https://stitch.googleapis.com/v1/asset', 'html')).resolves.toEqual({
      body: Buffer.from(html),
      contentType: 'text/html',
    });
    fetcher.mockResolvedValueOnce(
      Response.json({ dataString: png.toString('base64'), imageMetadata: { mimeType: 'PNG' } }),
    );
    await expect(download('https://cdn.example/asset', 'image')).rejects.toMatchObject({
      code: 'MOCKUP_PROVIDER_ERROR',
    });
    fetcher.mockResolvedValueOnce(
      Response.json({
        dataString: Buffer.from(html).toString('base64'),
        imageMetadata: { mimeType: 'PNG' },
      }),
    );
    await expect(download('https://stitch.googleapis.com/v1/asset', 'image')).rejects.toMatchObject(
      { code: 'MOCKUP_PROVIDER_ERROR' },
    );
    fetcher.mockResolvedValueOnce(Response.json({ unexpected: 'data' }));
    await expect(download('https://stitch.googleapis.com/v1/asset', 'html')).rejects.toMatchObject({
      code: 'MOCKUP_PROVIDER_ERROR',
    });
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
    expect(refined).toContain(
      'Ajustes solicitados por el usuario (aplícalos sin eliminar el contenido anterior): Usa tonos verdes',
    );
    expect(refined.endsWith('sin estados alternativos simultáneos.')).toBe(true);
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
    // The internal codes are not given to the generator: they came back as visible labels.
    expect(prompt).not.toContain('CU-001');
    expect(prompt).toContain('No muestres códigos internos');
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

describe('StitchMockupProvider one application (DEC-147)', () => {
  const buildPrompt = (...args: unknown[]) => {
    const provider = new StitchMockupProvider({ apiKey: 'test', timeoutMs: 100 });
    return (provider as unknown as { buildPrompt: (...a: unknown[]) => string }).buildPrompt(
      ...args,
    );
  };
  const screen = {
    localId: 'ventas',
    name: 'Ventas',
    purpose: 'Registrar ventas',
    targetActors: [],
    sections: [],
    primaryActions: [],
    secondaryActions: [],
    forms: [],
    principalData: [],
    states: [],
    relatedUseCaseCodes: ['CU-001'],
  };
  const context = {
    appName: 'Restaurante Mateos',
    menu: ['Inicio', 'Ventas', 'Inventario'],
    activeMenuByScreen: { ventas: 'Ventas', acceso: null },
  };
  it('gives every screen the same name and menu and marks the one it belongs to', () => {
    const prompt = buildPrompt(screen, 'DESKTOP', undefined, undefined, context);
    expect(prompt).toContain('«Restaurante Mateos»');
    expect(prompt).toContain('Inicio · Ventas · Inventario');
    expect(prompt).toContain('Resalta como activa la entrada «Ventas»');
    expect(prompt).toContain('No inventes datos de seguridad');
    expect(prompt).toContain('una sola vista');
  });
  it('draws a screen without a menu entry, such as the sign-in, without the menu', () => {
    const prompt = buildPrompt(
      { ...screen, localId: 'acceso' },
      'DESKTOP',
      undefined,
      undefined,
      context,
    );
    expect(prompt).toContain('«Restaurante Mateos»');
    expect(prompt).toContain('no lleva el menú principal');
    expect(prompt).not.toContain('Inicio · Ventas');
  });
  it('adds nothing about an application when there is no context', () => {
    expect(buildPrompt(screen, 'DESKTOP')).not.toContain('misma aplicación');
  });
  it('includes approved policies as reference data and forbids inventing business decisions', () => {
    const prompt = buildPrompt(screen, 'DESKTOP', 'Cambia la paleta', undefined, {
      ...context,
      approvedRequirements: [
        { code: 'RF-001', versionId: 'v1', description: 'Máximo tres préstamos activos.' },
      ],
    });
    expect(prompt).toContain('Máximo tres préstamos activos.');
    expect(prompt).toContain('No inventes reglas, límites, plazos');
    expect(prompt).toContain('no lo completes con convenciones del sector');
    expect(prompt).not.toContain('RF-001');
    expect(prompt).toContain('sin estados alternativos simultáneos');
  });
});
