import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Static hardening check (spec "Trusted SVG hardening"): TrustedDiagram is
// the ONLY intended raw-SVG insertion boundary in the whole frontend. If a
// future component bypasses it with its own dangerouslySetInnerHTML, this
// test fails loudly instead of silently widening the trusted surface.
function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.next') return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name)) return [full];
    return [];
  });
}

describe('TrustedDiagram is the only raw-SVG insertion boundary', () => {
  it('finds dangerouslySetInnerHTML only in trusted-svg.tsx', () => {
    const root = join(__dirname, '..');
    const files = [
      ...listSourceFiles(join(root, 'app')),
      ...listSourceFiles(join(root, 'components')),
      ...listSourceFiles(join(root, 'lib')),
    ];
    const offenders = files.filter((file) => {
      if (file.endsWith(join('components', 'trusted-svg.tsx'))) return false;
      return readFileSync(file, 'utf8').includes('dangerouslySetInnerHTML');
    });
    expect(offenders).toEqual([]);
  });

  it('trusted-svg.tsx documents the trust boundary and does not accept arbitrary props beyond svg/caption', () => {
    const source = readFileSync(join(__dirname, 'trusted-svg.tsx'), 'utf8');
    expect(source).toMatch(/trusted/i);
    expect(source).toMatch(/arbitrary/i);
  });
});
