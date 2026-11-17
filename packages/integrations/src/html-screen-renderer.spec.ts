import { writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { DockerHtmlScreenRenderer, FakeHtmlScreenRenderer } from './html-screen-renderer';
import { MockupProviderError } from './mockup-provider';
import { CAPTURE_BROWSER_IMAGE } from './runtime-capture-provider';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function docker(fail?: string) {
  const calls: string[][] = [];
  const runner = async (args: string[]) => {
    calls.push(args);
    if (fail && args[0] === fail) throw new Error('docker failed');
    // Copying the screenshot out of the container leaves it on disk.
    if (args[0] === 'cp' && args[1]!.endsWith(':/tmp/page.png')) await writeFile(args[2]!, PNG);
    return '';
  };
  return { calls, runner };
}

describe('DockerHtmlScreenRenderer', () => {
  it('draws the page in an isolated browser container and removes it', async () => {
    const { calls, runner } = docker();
    const png = await new DockerHtmlScreenRenderer(runner).render('<p>Hola</p>', 'MOBILE');
    expect(png.equals(PNG)).toBe(true);
    const create = calls.find((args) => args[0] === 'create')!;
    expect(create).toEqual(
      expect.arrayContaining(['--network=none', '--cap-drop=ALL', '--user=pwuser']),
    );
    expect(create).toContain(CAPTURE_BROWSER_IMAGE);
    expect(create.some((arg) => arg.startsWith('seccomp='))).toBe(true);
    // The image already existed: nothing is built.
    expect(calls.some((args) => args[0] === 'build')).toBe(false);
    expect(calls.at(-1)).toEqual(['rm', '-f', create[2]]);
  });

  it('reports a failure as an unavailable provider and still removes the container', async () => {
    const { calls, runner } = docker('start');
    await expect(
      new DockerHtmlScreenRenderer(runner).render('<p>Hola</p>', 'DESKTOP'),
    ).rejects.toThrow(MockupProviderError);
    expect(calls.at(-1)?.slice(0, 2)).toEqual(['rm', '-f']);
  });
});

describe('FakeHtmlScreenRenderer', () => {
  it('returns a PNG and remembers what it drew', async () => {
    const renderer = new FakeHtmlScreenRenderer();
    const png = await renderer.render('<p>x</p>', 'DESKTOP');
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(renderer.rendered).toEqual([{ html: '<p>x</p>', deviceType: 'DESKTOP' }]);
  });
});
