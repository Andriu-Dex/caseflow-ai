import type { MockupDeviceType, UiBlueprintContent } from '@caseflow-ai/contracts';
import {
  MockupProviderError,
  type EditedScreen,
  type GeneratedScreen,
  type ProviderScreenRef,
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

  async generate(
    content: UiBlueprintContent,
    deviceType: MockupDeviceType = 'DESKTOP',
    refinement?: string,
  ): Promise<MockupGenerationResult> {
    return this.withTimeout(
      () => this.generateWithSdk(content, deviceType, refinement),
      'La generación del boceto excedió el tiempo límite.',
      'El proveedor de bocetos no está disponible.',
    );
  }

  // Bounds the whole provider call and hides SDK internals behind a safe error.
  private async withTimeout<T>(
    run: () => Promise<T>,
    timeoutMessage: string,
    unavailableMessage: string,
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new MockupProviderError('MOCKUP_PROVIDER_TIMEOUT', timeoutMessage)),
            this.config.timeoutMs,
          );
        }),
      ]);
    } catch (cause) {
      if (cause instanceof MockupProviderError) throw cause;
      throw new MockupProviderError('MOCKUP_PROVIDER_UNAVAILABLE', unavailableMessage, { cause });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async generateWithSdk(
    content: UiBlueprintContent,
    deviceType: MockupDeviceType,
    refinement?: string,
  ): Promise<MockupGenerationResult> {
    const { Stitch, StitchToolClient } = await importSdk();
    const sdk = new Stitch(
      new StitchToolClient({ apiKey: this.config.apiKey, timeout: this.config.timeoutMs }),
    );
    const project = await sdk.createProject(`CASEFlow ${Date.now()}`);
    const screens = await Promise.all(
      content.screens.map(async (screen): Promise<GeneratedScreen> => {
        const generated = await project.generate(
          this.buildPrompt(screen, deviceType, refinement),
          deviceType,
        );
        const [imageUrl, htmlUrl] = await Promise.all([generated.getImage(), generated.getHtml()]);
        const [image, html] = await Promise.all([
          this.download(
            this.fullResolutionImageUrl(imageUrl, generated.data?.width, deviceType),
            'image',
          ),
          this.download(htmlUrl, 'html'),
        ]);
        return {
          screenLocalId: screen.localId,
          screenName: screen.name,
          image: { body: image.body, contentType: image.contentType },
          html: html.body.toString('utf8'),
          providerRef: { projectId: project.id, screenId: generated.id },
        };
      }),
    );
    if (screens.length === 0) throw new Error('Stitch returned no screens.');
    return { kind: 'STITCH', screens };
  }

  async editScreen(
    ref: ProviderScreenRef,
    prompt: string,
    deviceType: MockupDeviceType = 'DESKTOP',
  ): Promise<EditedScreen> {
    return this.withTimeout(
      async () => {
        const { Stitch, StitchToolClient } = await importSdk();
        const sdk = new Stitch(
          new StitchToolClient({ apiKey: this.config.apiKey, timeout: this.config.timeoutMs }),
        );
        const edited = await sdk
          .project(ref.projectId)
          .screen(ref.screenId)
          .edit(this.buildEditPrompt(prompt), deviceType);
        const [imageUrl, htmlUrl] = await Promise.all([edited.getImage(), edited.getHtml()]);
        const [image, html] = await Promise.all([
          this.download(
            this.fullResolutionImageUrl(imageUrl, edited.data?.width, deviceType),
            'image',
          ),
          this.download(htmlUrl, 'html'),
        ]);
        return {
          image: { body: image.body, contentType: image.contentType },
          html: html.body.toString('utf8'),
          providerRef: { projectId: edited.projectId ?? ref.projectId, screenId: edited.id },
        };
      },
      'La edición de la pantalla excedió el tiempo límite.',
      'El proveedor de bocetos no pudo editar la pantalla.',
    );
  }

  private buildEditPrompt(prompt: string): string {
    return `Modifica solo lo indicado y conserva el resto del diseño, el contenido y la estructura de la pantalla: ${prompt}`;
  }

  private fullResolutionImageUrl(
    imageUrl: string,
    screenWidth: unknown,
    deviceType: MockupDeviceType,
  ): string {
    const parsed = new URL(imageUrl);
    const width = Number(screenWidth);
    const minimumWidth = deviceType === 'MOBILE' ? 780 : 1600;
    const requestedWidth = Math.min(
      1920,
      Math.max(minimumWidth, Number.isSafeInteger(width) && width > 0 ? width : 0),
    );
    // Stitch screenshot URLs use Google's FIFE image sizing suffix. The bare URL
    // can return a small thumbnail even when the generated screen is full size.
    parsed.pathname = `${parsed.pathname.replace(/=w\d+(?:-h\d+)?$/, '')}=w${requestedWidth}`;
    return parsed.toString();
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

  private buildPrompt(
    screen: UiBlueprintContent['screens'][number],
    deviceType: MockupDeviceType,
    refinement?: string,
  ): string {
    return [
      deviceType === 'MOBILE'
        ? 'Diseña una pantalla de aplicación móvil (una sola columna, orientación vertical), limpia y profesional,'
        : 'Diseña una pantalla de aplicación web de escritorio, limpia y profesional,',
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
      screen.principalData.length
        ? `Datos principales que debe representar: ${screen.principalData.join(', ')}.`
        : '',
      screen.states.length ? `Estados relevantes: ${screen.states.join(', ')}.` : '',
      screen.relatedUseCaseCodes.length
        ? `Casos de uso relacionados: ${screen.relatedUseCaseCodes.join(', ')}.`
        : '',
      // Last, so it adjusts the design without replacing the blueprint above.
      refinement
        ? `Ajustes solicitados por el usuario (aplícalos sin eliminar el contenido anterior): ${refinement}`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
}
