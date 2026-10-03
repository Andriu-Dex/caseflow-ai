import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  designThemeContentSchema,
  designThemeContrastIssues,
  type DesignThemePalette,
} from './design-theme.contract';

const palette: DesignThemePalette = {
  background: '#ffffff',
  foreground: '#0f172a',
  primary: '#4338ca',
  primaryForeground: '#ffffff',
  secondary: '#e2e8f0',
  secondaryForeground: '#1e293b',
  accent: '#ccfbf1',
  accentForeground: '#134e4a',
  muted: '#f1f5f9',
  mutedForeground: '#475569',
  destructive: '#b91c1c',
  destructiveForeground: '#ffffff',
  border: '#cbd5e1',
};

describe('design theme contract', () => {
  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    // #777777 on white is the classic "just below AA" gray.
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('flags every text/surface pair below AA, with a Spanish message', () => {
    expect(designThemeContrastIssues({ light: palette })).toEqual([]);
    const issues = designThemeContrastIssues({
      light: { ...palette, mutedForeground: '#777777' },
    });
    expect(issues.map((i) => [i.text, i.surface])).toEqual([
      ['mutedForeground', 'background'],
      ['mutedForeground', 'muted'],
    ]);
    // Rounded down, so a failing ratio never reads as the 4.5 minimum.
    expect(issues[0]!.message).toBe(
      'Paleta clara: el texto secundario sobre el fondo tiene un contraste de 4.47:1 (mínimo 4.5:1).',
    );
  });

  it('requires exactly the palettes the mode uses', () => {
    expect(
      designThemeContentSchema.safeParse({ name: 'Claro', mode: 'LIGHT', light: palette }).success,
    ).toBe(true);
    expect(
      designThemeContentSchema.safeParse({ name: 'Ambos', mode: 'BOTH', light: palette }).success,
    ).toBe(false);
    expect(
      designThemeContentSchema.safeParse({
        name: 'Oscuro',
        mode: 'DARK',
        light: palette,
        dark: palette,
      }).success,
    ).toBe(false);
    expect(
      designThemeContentSchema.safeParse({
        name: 'Mal color',
        mode: 'LIGHT',
        light: { ...palette, primary: 'blue' },
      }).success,
    ).toBe(false);
  });
});
