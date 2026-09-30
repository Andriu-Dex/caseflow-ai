import { describe, expect, it } from 'vitest';
import { mockupPreviewResponseSchema, refineMockupRequestSchema } from './mockup.contract';

const id = '11111111-1111-4111-8111-111111111111';
const base = {
  id,
  projectId: id,
  code: 'MCK-001',
  versionId: id,
  uiBlueprintVersionId: id,
  deviceType: 'DESKTOP' as const,
  refinementPrompt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('refineMockupRequestSchema', () => {
  it('trims the instruction and bounds its length', () => {
    expect(refineMockupRequestSchema.parse({ prompt: '  Usa tonos verdes ' }).prompt).toBe(
      'Usa tonos verdes',
    );
    expect(refineMockupRequestSchema.safeParse({ prompt: '  a ' }).success).toBe(false);
    expect(refineMockupRequestSchema.safeParse({ prompt: 'x'.repeat(1001) }).success).toBe(false);
    expect(refineMockupRequestSchema.safeParse({ prompt: 'válido', extra: 1 }).success).toBe(false);
  });
});

describe('mockupPreviewResponseSchema', () => {
  it('accepts the internal SVG preview', () => {
    expect(
      mockupPreviewResponseSchema.parse({
        ...base,
        generatorKind: 'INTERNAL_WIREFRAME',
        svg: '<svg/>',
        screens: null,
      }).svg,
    ).toBe('<svg/>');
  });
  it('accepts Stitch screen links', () => {
    expect(
      mockupPreviewResponseSchema.parse({
        ...base,
        generatorKind: 'STITCH',
        svg: null,
        screens: [
          { id, screenLocalId: 'home', screenName: 'Inicio', imageUrl: '/image', htmlUrl: '/html' },
        ],
      }).screens,
    ).toHaveLength(1);
  });
});
