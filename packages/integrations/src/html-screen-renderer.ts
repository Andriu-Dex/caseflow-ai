import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MockupDeviceType } from '@caseflow-ai/contracts';
import { MockupProviderError } from './mockup-provider';
import {
  CAPTURE_BROWSER_DOCKERFILE,
  CAPTURE_BROWSER_IMAGE,
  CAPTURE_HARDENING,
  runDocker,
  type DockerRunner,
} from './runtime-capture-provider';
import captureSeccomp from './runtime-capture-seccomp.json';

// DEC-167: draws a static mockup page as the PNG shown in CASEFlow.
export interface HtmlScreenRenderer {
  render(html: string, deviceType: MockupDeviceType, signal?: AbortSignal): Promise<Buffer>;
}
export const HTML_SCREEN_RENDERER = Symbol('HTML_SCREEN_RENDERER');

export const MOCKUP_VIEWPORTS: Record<MockupDeviceType, { width: number; height: number }> = {
  DESKTOP: { width: 1440, height: 900 },
  MOBILE: { width: 390, height: 844 },
};

// Runs only inside the browser container. The page comes from a model, so it is
// drawn with JavaScript disabled and every request it would make is refused.
const RENDER_SCRIPT = String.raw`
const { chromium } = require('/opt/capture/node_modules/playwright');
const { readFile } = require('node:fs/promises');
setTimeout(() => process.exit(1), 60000).unref();
(async () => {
  const viewport = JSON.parse(await readFile('/tmp/controller/viewport.json', 'utf8'));
  const html = await readFile('/tmp/controller/page.html', 'utf8');
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, javaScriptEnabled: false, serviceWorkers: 'block' });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.screenshot({ path: '/tmp/page.png', fullPage: true });
  } finally {
    await browser.close();
  }
})().catch(() => process.exit(1));
`;

// The same isolated browser image as the runtime captures (DEC-152): no
// network, no capabilities, its own seccomp profile and an unprivileged user.
export class DockerHtmlScreenRenderer implements HtmlScreenRenderer {
  constructor(private readonly docker: DockerRunner = runDocker) {}

  async render(html: string, deviceType: MockupDeviceType, signal?: AbortSignal): Promise<Buffer> {
    const scratch = await mkdtemp(join(tmpdir(), 'caseflow-mockup-'));
    const controller = join(scratch, 'controller');
    const name = `caseflow-mockup-${randomUUID()}`;
    const command = (args: string[], timeoutMs = 60_000) => this.docker(args, timeoutMs, signal);
    try {
      await command(['info', '--format', '{{.ServerVersion}}'], 10_000);
      const prepared = await command(['image', 'inspect', CAPTURE_BROWSER_IMAGE]).then(
        () => true,
        () => false,
      );
      if (!prepared) {
        // Only the trusted Dockerfile is in the build context.
        await writeFile(join(scratch, 'Dockerfile.browser'), CAPTURE_BROWSER_DOCKERFILE);
        await command(
          [
            'build',
            '-t',
            CAPTURE_BROWSER_IMAGE,
            '-f',
            join(scratch, 'Dockerfile.browser'),
            scratch,
          ],
          240_000,
        );
      }
      await mkdir(controller);
      await writeFile(join(controller, 'render.cjs'), RENDER_SCRIPT);
      await writeFile(join(controller, 'page.html'), html);
      await writeFile(
        join(controller, 'viewport.json'),
        JSON.stringify(MOCKUP_VIEWPORTS[deviceType]),
      );
      await writeFile(join(scratch, 'seccomp.json'), JSON.stringify(captureSeccomp));
      await command([
        'create',
        '--name',
        name,
        '--network=none',
        ...CAPTURE_HARDENING,
        '--shm-size=256m',
        '--user=pwuser',
        '--security-opt',
        `seccomp=${join(scratch, 'seccomp.json')}`,
        CAPTURE_BROWSER_IMAGE,
        'node',
        '/tmp/controller/render.cjs',
      ]);
      await command(['cp', `${controller}/.`, `${name}:/tmp/controller`]);
      await command(['start', '-a', name], 90_000);
      await command(['cp', `${name}:/tmp/page.png`, join(scratch, 'page.png')]);
      return await readFile(join(scratch, 'page.png'));
    } catch (error) {
      signal?.throwIfAborted();
      throw new MockupProviderError(
        'MOCKUP_PROVIDER_UNAVAILABLE',
        'No se pudo dibujar la pantalla en el navegador aislado.',
        { cause: error },
      );
    } finally {
      // Cleanup is restricted to the container created for this page.
      await this.docker(['rm', '-f', name], 20_000).catch(() => undefined);
      await rm(scratch, { recursive: true, force: true });
    }
  }
}

// A 1x1 PNG, so tests exercise the flow without Docker.
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

export class FakeHtmlScreenRenderer implements HtmlScreenRenderer {
  readonly rendered: { html: string; deviceType: MockupDeviceType }[] = [];

  async render(html: string, deviceType: MockupDeviceType): Promise<Buffer> {
    this.rendered.push({ html, deviceType });
    return BLANK_PNG;
  }
}
