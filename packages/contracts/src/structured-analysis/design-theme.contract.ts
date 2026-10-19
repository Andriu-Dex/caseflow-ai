import { z } from 'zod';

// ---- DESIGN_THEME (DEC-118, ADR-003) ----------------------------------------
// Mode plus semantic palette tokens (shadcn/ui naming) for light and/or dark.
// The same content paints the mockups and the generated frontend.

export const DESIGN_THEME_MODES = ['LIGHT', 'DARK', 'BOTH'] as const;
export type DesignThemeMode = (typeof DESIGN_THEME_MODES)[number];

const hexColor = () =>
  z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use un color hexadecimal con el formato #RRGGBB.');

export const designThemePaletteSchema = z
  .object({
    background: hexColor(),
    foreground: hexColor(),
    primary: hexColor(),
    primaryForeground: hexColor(),
    secondary: hexColor(),
    secondaryForeground: hexColor(),
    accent: hexColor(),
    accentForeground: hexColor(),
    muted: hexColor(),
    mutedForeground: hexColor(),
    destructive: hexColor(),
    destructiveForeground: hexColor(),
    border: hexColor(),
  })
  .strict();
export type DesignThemePalette = z.output<typeof designThemePaletteSchema>;
export type DesignThemeToken = keyof DesignThemePalette;

export const DESIGN_THEME_TOKENS = Object.keys(
  designThemePaletteSchema.shape,
) as DesignThemeToken[];

export const designThemeContentSchema = z
  .object({
    name: z.string().trim().min(1, 'El valor es obligatorio.').max(80),
    description: z.string().trim().min(1).max(1000).optional(),
    mode: z.enum(DESIGN_THEME_MODES),
    light: designThemePaletteSchema.optional(),
    dark: designThemePaletteSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const needsLight = value.mode !== 'DARK';
    const needsDark = value.mode !== 'LIGHT';
    if (needsLight !== Boolean(value.light))
      ctx.addIssue({
        code: 'custom',
        message: needsLight
          ? 'El modo elegido requiere la paleta clara.'
          : 'El modo oscuro no usa paleta clara.',
        path: ['light'],
      });
    if (needsDark !== Boolean(value.dark))
      ctx.addIssue({
        code: 'custom',
        message: needsDark
          ? 'El modo elegido requiere la paleta oscura.'
          : 'El modo claro no usa paleta oscura.',
        path: ['dark'],
      });
  });
export type DesignThemeContent = z.output<typeof designThemeContentSchema>;

// What the AI returns: up to three alternative palettes to choose from.
export const designThemeGenerationOutputSchema = z
  .object({ palettes: z.array(designThemeContentSchema).min(1).max(3) })
  .strict();

// ---- WCAG AA contrast ----------------------------------------------------------

export const WCAG_AA_MIN_CONTRAST = 4.5;

// Text token -> surface token it is read on, in the generated UI.
export const DESIGN_THEME_CONTRAST_PAIRS: {
  text: DesignThemeToken;
  surface: DesignThemeToken;
  label: string;
}[] = [
  { text: 'foreground', surface: 'background', label: 'el texto principal sobre el fondo' },
  { text: 'mutedForeground', surface: 'background', label: 'el texto secundario sobre el fondo' },
  { text: 'mutedForeground', surface: 'muted', label: 'el texto secundario sobre muted' },
  { text: 'primaryForeground', surface: 'primary', label: 'el texto sobre primary' },
  { text: 'secondaryForeground', surface: 'secondary', label: 'el texto sobre secondary' },
  { text: 'accentForeground', surface: 'accent', label: 'el texto sobre accent' },
  { text: 'destructiveForeground', surface: 'destructive', label: 'el texto sobre destructive' },
  { text: 'destructive', surface: 'background', label: 'los mensajes de error sobre el fondo' },
];

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

// WCAG 2.x contrast ratio, from 1 (same color) to 21 (black on white).
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

export interface DesignThemeContrastIssue {
  palette: 'light' | 'dark';
  text: DesignThemeToken;
  surface: DesignThemeToken;
  ratio: number;
  message: string;
}

// Every text/surface pair below AA. A theme with issues cannot be approved.
export function designThemeContrastIssues(
  content: Pick<DesignThemeContent, 'light' | 'dark'>,
): DesignThemeContrastIssue[] {
  const issues: DesignThemeContrastIssue[] = [];
  for (const palette of ['light', 'dark'] as const) {
    const colors = content[palette];
    if (!colors) continue;
    for (const pair of DESIGN_THEME_CONTRAST_PAIRS) {
      const ratio = contrastRatio(colors[pair.text], colors[pair.surface]);
      if (ratio < WCAG_AA_MIN_CONTRAST)
        issues.push({
          palette,
          text: pair.text,
          surface: pair.surface,
          ratio,
          message: `Paleta ${palette === 'light' ? 'clara' : 'oscura'}: ${pair.label} tiene un contraste de ${(Math.floor(ratio * 100) / 100).toFixed(2)}:1 (mínimo ${WCAG_AA_MIN_CONTRAST}:1).`,
        });
    }
  }
  return issues;
}
