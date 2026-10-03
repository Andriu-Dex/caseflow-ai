import { Injectable } from '@nestjs/common';
import type {
  DesignThemeContent,
  DesignThemePalette,
  MockupDeviceType,
  UiBlueprintContent,
} from '@caseflow-ai/contracts';
import type { MockupGenerationResult, MockupProvider } from '@caseflow-ai/integrations';

// Carried in every stored MockupDetail so a future format change is
// distinguishable from the source UI Blueprint it was derived from.
export const MOCKUP_GENERATOR_VERSION = 'caseflow-mockup-wireframe-v1';

const CARD_WIDTH = 360;
const PADDING = 16;
const LINE_HEIGHT = 20;
const HEADER_HEIGHT = 36;
// ponytail: fixed 10-section cap keeps card height bounded/deterministic;
// raise if a real blueprint needs more visible sections per screen.
const MAX_VISIBLE_SECTIONS = 10;

// The standard design's wireframe colors, used when the project has no theme.
type WireframeColors = Pick<
  DesignThemePalette,
  | 'background'
  | 'border'
  | 'muted'
  | 'mutedForeground'
  | 'primary'
  | 'primaryForeground'
  | 'secondary'
  | 'secondaryForeground'
> & { header: string; headerForeground: string };
const STANDARD_COLORS: WireframeColors = {
  background: '#ffffff',
  border: '#94a3b8',
  muted: '#f8fafc',
  mutedForeground: '#64748b',
  primary: '#4f46e5',
  primaryForeground: '#ffffff',
  secondary: '#e2e8f0',
  secondaryForeground: '#334155',
  header: '#1e293b',
  headerForeground: '#ffffff',
};

// One drawing: the light palette when the app supports both modes.
function wireframeColors(theme?: DesignThemeContent): WireframeColors {
  const palette = theme?.light ?? theme?.dark;
  if (!palette) return STANDARD_COLORS;
  return { ...palette, header: palette.primary, headerForeground: palette.primaryForeground };
}

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Deterministic HTML/SVG-shaped wireframe from structured UI Blueprint data
// (spec §18): no AI, no raster image, no external renderer. Screen/section/
// action text is untrusted (may originate from an AI-generated blueprint),
// so every piece of text is XML-escaped before insertion; the caller still
// runs the result through sanitizeDiagramSvg() as the real safety boundary.
@Injectable()
export class MockupRenderer {
  render(
    content: UiBlueprintContent,
    deviceType: MockupDeviceType = 'DESKTOP',
    theme?: DesignThemeContent,
  ): string {
    // Palette values are schema-validated #RRGGBB, safe to inline.
    const colors = wireframeColors(theme);
    const screens = [...content.screens].sort((a, b) => compareOrdinal(a.localId, b.localId));
    const columns = deviceType === 'MOBILE' ? 1 : Math.min(3, Math.max(1, screens.length));
    const columnHeights = new Array<number>(columns).fill(PADDING);
    const parts: string[] = [];
    screens.forEach((screen, index) => {
      const column = index % columns;
      const x = PADDING + column * (CARD_WIDTH + PADDING);
      const y = columnHeights[column]!;
      const height = this.measureCard(screen);
      parts.push(this.renderCard(screen, x, y, height, colors));
      columnHeights[column] = y + height + PADDING;
    });
    const width = columns * CARD_WIDTH + (columns + 1) * PADDING;
    const totalHeight = Math.max(...columnHeights, PADDING * 2);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" ` +
      `viewBox="0 0 ${width} ${totalHeight}">` +
      `<rect x="0" y="0" width="${width}" height="${totalHeight}" fill="${colors.muted}"/>` +
      parts.join('') +
      `</svg>`
    );
  }

  private measureCard(screen: UiBlueprintContent['screens'][number]): number {
    let lines =
      2 +
      (screen.targetActors.length ? 1 : 0) +
      Math.min(screen.sections.length, MAX_VISIBLE_SECTIONS);
    if (screen.primaryActions.length || screen.secondaryActions.length) lines += 1;
    if (screen.forms.length) lines += 1;
    return HEADER_HEIGHT + lines * LINE_HEIGHT + PADDING;
  }

  private renderCard(
    screen: UiBlueprintContent['screens'][number],
    x: number,
    y: number,
    height: number,
    colors: WireframeColors,
  ): string {
    const parts: string[] = [
      `<rect x="${x}" y="${y}" width="${CARD_WIDTH}" height="${height}" fill="${colors.background}" stroke="${colors.border}" stroke-width="1" rx="4"/>`,
      `<rect x="${x}" y="${y}" width="${CARD_WIDTH}" height="${HEADER_HEIGHT}" fill="${colors.header}" rx="4"/>`,
      `<text x="${x + PADDING}" y="${y + HEADER_HEIGHT / 2 + 5}" fill="${colors.headerForeground}" font-family="sans-serif" font-size="14">${escapeXml(screen.name)}</text>`,
    ];
    let cursorY = y + HEADER_HEIGHT + PADDING;
    const purpose = screen.purpose.length > 60 ? `${screen.purpose.slice(0, 59)}…` : screen.purpose;
    parts.push(
      `<text x="${x + PADDING}" y="${cursorY}" font-family="sans-serif" font-size="11" fill="${colors.mutedForeground}">${escapeXml(purpose)}</text>`,
    );
    cursorY += LINE_HEIGHT;
    if (screen.targetActors.length) {
      parts.push(
        `<text x="${x + PADDING}" y="${cursorY}" font-family="sans-serif" font-size="11" fill="${colors.mutedForeground}">${escapeXml(`Actores: ${screen.targetActors.join(', ')}`)}</text>`,
      );
      cursorY += LINE_HEIGHT;
    }
    for (const section of screen.sections.slice(0, MAX_VISIBLE_SECTIONS)) {
      parts.push(
        `<rect x="${x + PADDING}" y="${cursorY - 14}" width="${CARD_WIDTH - PADDING * 2}" height="18" fill="${colors.secondary}"/>`,
        `<text x="${x + PADDING + 4}" y="${cursorY}" font-family="sans-serif" font-size="11" fill="${colors.secondaryForeground}">${escapeXml(section)}</text>`,
      );
      cursorY += LINE_HEIGHT;
    }
    const actions = [...screen.primaryActions, ...screen.secondaryActions];
    if (actions.length) {
      let buttonX = x + PADDING;
      for (const action of actions) {
        const buttonWidth = Math.min(120, 24 + action.length * 6);
        parts.push(
          `<rect x="${buttonX}" y="${cursorY - 14}" width="${buttonWidth}" height="20" rx="3" fill="${colors.primary}"/>`,
          `<text x="${buttonX + 6}" y="${cursorY}" font-family="sans-serif" font-size="10" fill="${colors.primaryForeground}">${escapeXml(action)}</text>`,
        );
        buttonX += buttonWidth + 6;
      }
      cursorY += LINE_HEIGHT;
    }
    if (screen.forms.length) {
      parts.push(
        `<text x="${x + PADDING}" y="${cursorY}" font-family="sans-serif" font-size="10" fill="${colors.mutedForeground}">Formularios: ${escapeXml(screen.forms.join(', '))}</text>`,
      );
    }
    return parts.join('');
  }
}

@Injectable()
export class InternalWireframeMockupProvider implements MockupProvider {
  readonly id = 'internal-wireframe';
  constructor(private readonly renderer: MockupRenderer) {}
  async generate(
    content: UiBlueprintContent,
    deviceType?: MockupDeviceType,
    _refinement?: string,
    theme?: DesignThemeContent,
  ): Promise<MockupGenerationResult> {
    return { kind: 'INTERNAL_WIREFRAME', svg: this.renderer.render(content, deviceType, theme) };
  }
}
