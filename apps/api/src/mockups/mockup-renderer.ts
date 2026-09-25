import { Injectable } from '@nestjs/common';
import type { UiBlueprintContent } from '@caseflow-ai/contracts';

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
  render(content: UiBlueprintContent): string {
    const screens = [...content.screens].sort((a, b) => compareOrdinal(a.localId, b.localId));
    const parts: string[] = [];
    let y = PADDING;
    for (const screen of screens) {
      const height = this.measureCard(screen);
      parts.push(this.renderCard(screen, PADDING, y, height));
      y += height + PADDING;
    }
    const width = CARD_WIDTH + PADDING * 2;
    const totalHeight = Math.max(y, PADDING * 2);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" ` +
      `viewBox="0 0 ${width} ${totalHeight}">` +
      `<rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#f8fafc"/>` +
      parts.join('') +
      `</svg>`
    );
  }

  private measureCard(screen: UiBlueprintContent['screens'][number]): number {
    let lines = 1 + Math.min(screen.sections.length, MAX_VISIBLE_SECTIONS);
    if (screen.primaryActions.length || screen.secondaryActions.length) lines += 1;
    if (screen.forms.length) lines += 1;
    return HEADER_HEIGHT + lines * LINE_HEIGHT + PADDING;
  }

  private renderCard(
    screen: UiBlueprintContent['screens'][number],
    x: number,
    y: number,
    height: number,
  ): string {
    const parts: string[] = [
      `<rect x="${x}" y="${y}" width="${CARD_WIDTH}" height="${height}" fill="#ffffff" stroke="#94a3b8" stroke-width="1" rx="4"/>`,
      `<rect x="${x}" y="${y}" width="${CARD_WIDTH}" height="${HEADER_HEIGHT}" fill="#1e293b" rx="4"/>`,
      `<text x="${x + PADDING}" y="${y + HEADER_HEIGHT / 2 + 5}" fill="#ffffff" font-family="sans-serif" font-size="14">${escapeXml(screen.name)}</text>`,
    ];
    let cursorY = y + HEADER_HEIGHT + PADDING;
    for (const section of screen.sections.slice(0, MAX_VISIBLE_SECTIONS)) {
      parts.push(
        `<rect x="${x + PADDING}" y="${cursorY - 14}" width="${CARD_WIDTH - PADDING * 2}" height="18" fill="#e2e8f0"/>`,
        `<text x="${x + PADDING + 4}" y="${cursorY}" font-family="sans-serif" font-size="11" fill="#334155">${escapeXml(section)}</text>`,
      );
      cursorY += LINE_HEIGHT;
    }
    const actions = [...screen.primaryActions, ...screen.secondaryActions];
    if (actions.length) {
      let buttonX = x + PADDING;
      for (const action of actions) {
        const buttonWidth = Math.min(120, 24 + action.length * 6);
        parts.push(
          `<rect x="${buttonX}" y="${cursorY - 14}" width="${buttonWidth}" height="20" rx="3" fill="#2563eb"/>`,
          `<text x="${buttonX + 6}" y="${cursorY}" font-family="sans-serif" font-size="10" fill="#ffffff">${escapeXml(action)}</text>`,
        );
        buttonX += buttonWidth + 6;
      }
      cursorY += LINE_HEIGHT;
    }
    if (screen.forms.length) {
      parts.push(
        `<text x="${x + PADDING}" y="${cursorY}" font-family="sans-serif" font-size="10" fill="#64748b">Formularios: ${escapeXml(screen.forms.join(', '))}</text>`,
      );
    }
    return parts.join('');
  }
}
