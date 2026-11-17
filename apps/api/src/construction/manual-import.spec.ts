import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { MANUAL_IMPORT_LIMITS, ManualImportError, readManualArchive } from './manual-import';

const archive = async (entries: Record<string, string | Uint8Array>) => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer' });
};

describe('readManualArchive', () => {
  it('reads the project files, unwrapping the folder the ZIP was made from', async () => {
    const result = await readManualArchive(
      await archive({
        'demo/package.json': '{}',
        'demo/apps/api/src/main.ts': 'export {};',
        'demo/apps/api/src/main.spec.ts': 'export {};',
        'demo/docs/notes.md': '# Notas',
      }),
    );
    expect(result.files).toEqual([
      { path: 'apps/api/src/main.spec.ts', content: 'export {};', kind: 'TEST' },
      { path: 'apps/api/src/main.ts', content: 'export {};', kind: 'SOURCE' },
      { path: 'docs/notes.md', content: '# Notas', kind: 'DOCUMENTATION' },
      { path: 'package.json', content: '{}', kind: 'CONFIG' },
    ]);
  });

  it('leaves out dependencies, build output, secrets and generation checkpoints', async () => {
    const result = await readManualArchive(
      await archive({
        'package.json': '{}',
        '.env': 'SECRET=1',
        '.env.local': 'SECRET=1',
        '.env.example': 'SECRET=',
        'pnpm-lock.yaml': 'lock',
        'node_modules/x/index.js': 'x',
        'apps/web/.next/server.js': 'x',
        'docs/business-logic/abc.json': '{"body":"return 1;"}',
        'docs/presentations/abc.json': '{}',
        'docs/demo-data/abc.json': '{}',
        'docs/design-fidelity.json': '{}',
      }),
    );
    expect(result.files.map((file) => file.path)).toEqual(['.env.example', 'package.json']);
    expect(result.skipped).toBe(9);
  });

  it('takes the declared plan elements from the manifest without importing it', async () => {
    const result = await readManualArchive(
      await archive({
        'package.json': '{}',
        'caseflow-manifest.json': JSON.stringify({
          traceLinks: [
            { path: 'package.json', planElement: 'project', artifactVersionId: 'ignored' },
            { path: 'package.json', planElement: 'module:sales' },
            { path: 7, planElement: 'module:sales' },
          ],
        }),
      }),
    );
    expect(result.files.map((file) => file.path)).toEqual(['package.json']);
    expect(result.declaredElements).toEqual(
      new Map([['package.json', ['project', 'module:sales']]]),
    );
  });

  it('stops inflating a file that passes the size limit', async () => {
    const zip = new JSZip();
    zip.file('package.json', '{}');
    zip.file('apps/api/src/big.ts', 'x'.repeat(MANUAL_IMPORT_LIMITS.fileBytes + 1));
    await expect(
      readManualArchive(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })),
    ).rejects.toThrow('supera el tamaño máximo');
  });

  it('rejects unsafe paths, binary content and archives that are not a ZIP', async () => {
    // The ZIP reader already resolves relative segments: nothing escapes the project.
    const escaped = await readManualArchive(
      await archive({ '../outside.ts': 'x', 'apps/../../other.ts': 'x' }),
    );
    expect(escaped.files.every((file) => !file.path.includes('..'))).toBe(true);
    await expect(
      readManualArchive(
        await archive({ 'apps/logo.png': new Uint8Array([0x89, 0x50, 0xff, 0xfe, 0x00]) }),
      ),
    ).rejects.toBeInstanceOf(ManualImportError);
    await expect(readManualArchive(Buffer.from('not a zip'))).rejects.toBeInstanceOf(
      ManualImportError,
    );
    await expect(readManualArchive(await archive({ '.env': 'x' }))).rejects.toThrow(
      'no contiene archivos',
    );
  });
});
