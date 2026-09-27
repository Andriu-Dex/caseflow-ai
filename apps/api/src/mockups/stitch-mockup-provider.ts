import type { UiBlueprintContent } from '@caseflow-ai/contracts';
import {
  MockupProviderError,
  type GeneratedScreen,
  type MockupGenerationResult,
  type MockupProvider,
} from '@caseflow-ai/integrations';

export interface StitchMockupProviderConfig {
  apiKey: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

// The official Google SDK is ESM-only, while the NestJS application emits
// CommonJS. A native runtime import avoids TypeScript rewriting it to require().
const importSdk = new Function('return import("stitch-sdk")') as () => Promise<
  typeof import('stitch-sdk')
>;

export class StitchMockupProvider implements MockupProvider {
  readonly id = 'stitch';
  constructor(private readonly config: StitchMockupProviderConfig) {}

  async generate(content: UiBlueprintContent): Promise<MockupGenerationResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.generateWithSdk(content),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new MockupProviderError(
                  'MOCKUP_PROVIDER_TIMEOUT',
                  'La generación del boceto excedió el tiempo límite.',
                ),
              ),
            this.config.timeoutMs,
          );
        }),
      ]);
    } catch (cause) {
      if (cause instanceof MockupProviderError) throw cause;
      throw new MockupProviderError(
        'MOCKUP_PROVIDER_UNAVAILABLE',
        'El proveedor de bocetos no está disponible.',
        { cause },
      );
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async generateWithSdk(content: UiBlueprintContent): Promise<MockupGenerationResult> {
    const { Stitch, StitchToolClient } = await importSdk();
    const sdk = new Stitch(
      new StitchToolClient({ apiKey: this.config.apiKey, timeout: this.config.timeoutMs }),
    );
    const project = await sdk.createProject(`CASEFlow ${Date.now()}`);
    const screens = await Promise.all(
      content.screens.map(async (screen): Promise<GeneratedScreen> => {
        const generated = await project.generate(this.buildPrompt(screen), 'DESKTOP');
        const [imageUrl, htmlUrl] = await Promise.all([generated.getImage(), generated.getHtml()]);
        const [image, html] = await Promise.all([
          this.download(imageUrl, 'image'),
          this.download(htmlUrl, 'html'),
        ]);
        return {
          screenLocalId: screen.localId,
          screenName: screen.name,
          image: { body: image.body, contentType: image.contentType },
          html: html.body.toString('utf8'),
        };
      }),
    );
    if (screens.length === 0) throw new Error('Stitch returned no screens.');
    return { kind: 'STITCH', screens };
  }

  private async download(url: string, kind: 'image' | 'html') {
    if (new URL(url).protocol !== 'https:')
      throw new MockupProviderError(
        'MOCKUP_PROVIDER_ERROR',
        'El proveedor devolvió un enlace no seguro.',
      );
    let response: Response;
    try {
      response = await (this.config.fetch ?? fetch)(url, {
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (cause) {
      throw new MockupProviderError('MOCKUP_PROVIDER_TIMEOUT', 'La descarga del boceto falló.', {
        cause,
      });
    }
    if (!response.ok)
      throw new MockupProviderError('MOCKUP_PROVIDER_ERROR', 'No se pudo descargar el boceto.');
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
    const allowed =
      kind === 'image'
        ? ['image/png', 'image/jpeg', 'image/webp'].includes(contentType)
        : contentType === 'text/html';
    if (!allowed)
      throw new MockupProviderError(
        'MOCKUP_PROVIDER_ERROR',
        'El proveedor devolvió un archivo no válido.',
      );
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0 || body.length > (kind === 'image' ? 10_000_000 : 2_000_000))
      throw new MockupProviderError(
        'MOCKUP_PROVIDER_ERROR',
        'El archivo generado tiene un tamaño no válido.',
      );
    return { body, contentType };
  }

  private buildPrompt(screen: UiBlueprintContent['screens'][number]): string {
    return [
      'Diseña una pantalla de aplicación web de escritorio, limpia y profesional,',
      'con buen espaciado entre elementos, jerarquía visual clara y sin superponer componentes.',
      `Pantalla: ${screen.name}. Propósito: ${screen.purpose}.`,
      screen.targetActors.length ? `Usuarios objetivo: ${screen.targetActors.join(', ')}.` : '',
      screen.sections.length ? `Secciones visibles: ${screen.sections.join(', ')}.` : '',
      screen.primaryActions.length
        ? `Acciones principales (botones destacados): ${screen.primaryActions.join(', ')}.`
        : '',
      screen.secondaryActions.length
        ? `Acciones secundarias: ${screen.secondaryActions.join(', ')}.`
        : '',
      screen.forms.length ? `Campos de formulario: ${screen.forms.join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
}
