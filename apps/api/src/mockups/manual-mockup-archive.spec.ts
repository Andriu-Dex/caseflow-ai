import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { readManualMockupArchive } from './manual-mockup-archive';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const page = (body: string) => `<!doctype html><html><head></head><body>${body}</body></html>`;

async function archive(files: Record<string, string | Buffer>) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('readManualMockupArchive', () => {
  it('reads one page and image per screen and places the shared styles in each page', async () => {
    const screens = await readManualMockupArchive(
      await archive({
        'bocetos/login.html': page('<h1>Acceso</h1>'),
        'bocetos/login.png': PNG,
        'bocetos/sales.html': page('<h1>Ventas</h1>'),
        'bocetos/sales.png': PNG,
        'bocetos/styles.css': 'h1 { color: #333; } .total::after { content: "$&"; }',
        '__MACOSX/bocetos/._login.html': 'x',
      }),
      ['login', 'sales'],
    );
    expect([...screens.keys()]).toEqual(['login', 'sales']);
    const login = screens.get('login')!;
    expect(login.html).toContain('<style>\nh1 { color: #333; } .total::after { content: "$&"; }');
    expect(login.html.indexOf('<style>')).toBeLessThan(login.html.indexOf('</head>'));
    expect(login.image.contentType).toBe('image/png');
  });

  it('names the screens that lack their page or image', async () => {
    await expect(
      readManualMockupArchive(
        await archive({ 'login.html': page(''), 'login.png': PNG, 'sales.html': page('') }),
        ['login', 'sales'],
      ),
    ).rejects.toThrow('Faltan el HTML o la imagen PNG de 1 pantallas: sales.');
  });

  it('rejects files of screens the blueprint does not define', async () => {
    await expect(
      readManualMockupArchive(await archive({ 'other.html': page('') }), ['login']),
    ).rejects.toThrow('«other.html» no corresponde a ninguna pantalla del plano.');
  });

  it.each([
    ['<script>alert(1)</script>', 'contiene scripts'],
    ['<img src="x.png" onerror="steal()">', 'contiene manejadores de eventos'],
    ['<a href="javascript:void(0)">x</a>', 'contiene enlaces javascript:'],
    ['<img src="https://example.com/a.png">', 'carga recursos de internet'],
    ['<link rel="stylesheet" href="a.css">', 'carga contenido externo'],
    ['<style>@import "x.css";</style>', 'importa otras hojas de estilo'],
  ])('rejects a page that %s', async (body, reason) => {
    await expect(
      readManualMockupArchive(await archive({ 'login.html': page(body), 'login.png': PNG }), [
        'login',
      ]),
    ).rejects.toThrow(`«login.html» ${reason}.`);
  });

  it('rejects an image that is not a PNG and styles that load from the internet', async () => {
    await expect(
      readManualMockupArchive(
        await archive({ 'login.html': page(''), 'login.png': Buffer.from('GIF89a') }),
        ['login'],
      ),
    ).rejects.toThrow('«login.png» no es una imagen PNG.');
    await expect(
      readManualMockupArchive(
        await archive({
          'login.html': page(''),
          'login.png': PNG,
          'styles.css': 'body { background: url(https://example.com/a.png) }',
        }),
        ['login'],
      ),
    ).rejects.toThrow('«styles.css» carga recursos de internet.');
  });
});
