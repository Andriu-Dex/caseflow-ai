import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { readManualMockupArchive } from './manual-mockup-archive';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const page = (body: string) => `<!doctype html><html><head></head><body>${body}</body></html>`;
// A CSS escape such as «\75 » (the letter u), written without a literal backslash.
const cssEscape = (hex: string) => `${String.fromCharCode(92)}${hex} `;

async function archive(files: Record<string, string | Buffer>) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const onePage = async (body: string) =>
  readManualMockupArchive(await archive({ 'login.html': page(body), 'login.png': PNG }), ['login']);

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
    const styles = login.html.indexOf('h1 { color: #333; } .total::after { content: "$&"; }');
    expect(styles).toBeGreaterThan(login.html.indexOf('<style>'));
    expect(styles).toBeLessThan(login.html.indexOf('</head>'));
    expect(login.html).toContain('<h1>Acceso</h1>');
    expect(login.image.contentType).toBe('image/png');
  });

  it('stores every page with a security policy as the first element of its head', async () => {
    const login = (await onePage('<p>Acceso</p>')).get('login')!;
    expect(login.html).toMatch(
      /<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;/,
    );
  });

  it('keeps links inside the page, relative paths, mail links and embedded images', async () => {
    const login = (
      await onePage(
        '<a href="#total">Total</a><a href="/ventas">Ventas</a><a href="mailto:caja@mateos.ec">Correo</a>' +
          '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Logo">' +
          '<div style="background: url(data:image/png;base64,iVBORw0KGgo=)">Marca</div>',
      )
    ).get('login')!;
    expect(login.html).toContain('href="/ventas"');
    expect(login.html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
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
    ['<svg><script>alert(1)</script></svg>', 'contiene scripts'],
    ['<img src="x.png" onerror="steal()">', 'contiene manejadores de eventos'],
    // Written the way a browser still reads them, without a space before the handler.
    ['<img/onerror=alert(1) src=x.png>', 'contiene manejadores de eventos'],
    ['<img src="x.png"onerror="steal()">', 'contiene manejadores de eventos'],
    ['<a href="javascript:void(0)">x</a>', 'contiene enlaces javascript:'],
    ['<a href="jav&#x61;script&colon;alert(1)">x</a>', 'contiene enlaces javascript:'],
    ['<a href="java&#9;script:alert(1)">x</a>', 'contiene enlaces javascript:'],
    ['<img src="https://example.com/a.png">', 'carga recursos de internet'],
    ['<img src="//example.com/a.png">', 'carga recursos de internet'],
    ['<link rel="stylesheet" href="a.css">', 'carga contenido externo'],
    ['<iframe srcdoc="<p>x</p>"></iframe>', 'carga contenido externo'],
    [
      '<meta charset="utf-8" http-equiv="refresh" content="0;url=https://example.com">',
      'carga contenido externo',
    ],
    [
      '<svg><a href="#"><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a></svg>',
      'contiene la etiqueta <animate>, que no se admite',
    ],
    [
      '<svg><use href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=#x"/></svg>',
      'incrusta datos que no son imágenes',
    ],
    ['<a href="data:text/html,hola">x</a>', 'incrusta datos que no son imágenes'],
    ['<img srcset="a.png 1x, https://example.com/b.png 2x">', 'contiene el atributo srcset'],
    ['<style>@import "x.css";</style>', 'importa otras hojas de estilo'],
    [`<style>@${cssEscape('69')}mport "x.css";</style>`, 'importa otras hojas de estilo'],
    [
      `<div style="background: ${cssEscape('75')}rl(https://example.com/a.png)">x</div>`,
      'carga recursos de internet',
    ],
    [
      '<style>body { background: image-set("https://example.com/a.png" 1x) }</style>',
      'carga recursos de internet',
    ],
  ])('rejects a page with %s', async (body, reason) => {
    await expect(onePage(body)).rejects.toThrow(`«login.html» ${reason}`);
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
