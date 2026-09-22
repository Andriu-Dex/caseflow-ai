import { describe, expect, it } from 'vitest';
import { KrokiDiagramProvider } from '@caseflow-ai/integrations';
import { DiagramEngine } from '../../src/data-models/diagram-engine';
import { sanitizeDiagramSvg } from '../../src/data-models/svg-sanitizer';

// Exercises the actual local Kroki deployment (infra/docker/compose.yml /
// CI service containers) — never a public kroki.io endpoint. This proves
// generated Mermaid ER / PlantUML source is accepted by a real compatible
// engine and that the resulting SVG is a genuine graphical diagram, not the
// old fixed textual preview. Requires `pnpm infra:up` (or the CI service
// containers) to already be running.
const KROKI_BASE_URL = process.env.KROKI_BASE_URL ?? 'http://localhost:8000';
const engine = new DiagramEngine();

function provider(overrides: Partial<{ baseUrl: string; timeoutMs: number }> = {}) {
  return new KrokiDiagramProvider({
    baseUrl: overrides.baseUrl ?? KROKI_BASE_URL,
    timeoutMs: overrides.timeoutMs ?? 10_000,
  });
}

const erModel = {
  entities: [
    {
      localId: 'customer',
      name: 'Customer',
      attributes: [{ name: 'id', type: 'UUID', primaryKey: true, unique: true }],
    },
    {
      localId: 'order',
      name: 'Order',
      attributes: [{ name: 'total', type: 'DECIMAL', primaryKey: false, unique: false }],
    },
  ],
  relationships: [
    {
      sourceEntityId: 'customer',
      targetEntityId: 'order',
      sourceCardinality: 'ONE',
      targetCardinality: 'ZERO_OR_MORE',
      name: 'places',
    },
  ],
};
const useCaseModel = {
  systemName: 'Sistema',
  useCases: [{ code: 'CU-001', name: 'Sign in', actors: ['Administrator', 'Customer'] }],
};

describe('Real diagram rendering (local Kroki)', () => {
  it('renders deterministic Mermaid ER source into a real graphical SVG', async () => {
    const source = engine.generateER(erModel);
    engine.validate('MERMAID_ER', source);
    const rendered = await provider().render({ format: 'MERMAID_ER', source });
    const svg = sanitizeDiagramSvg(rendered.svg);

    expect(svg).toContain('<svg');
    // A real Mermaid ER render, not the old fixed textual-preview template.
    expect(svg).toContain('aria-roledescription="er"');
    expect(svg).not.toContain('font-family="monospace"');
    // Entity/relationship semantics from the structured input appear in the
    // rendered output.
    expect(svg).toContain('Customer');
    expect(svg).toContain('Order');
  });

  it('renders deterministic PlantUML Use Case source into a real graphical UML SVG', async () => {
    const source = engine.generateUseCase(useCaseModel);
    engine.validate('PLANTUML', source);
    const rendered = await provider().render({ format: 'PLANTUML', source });
    const svg = sanitizeDiagramSvg(rendered.svg);

    expect(svg).toContain('<svg');
    // Actors render as stick figures (an ellipse head); this is real UML
    // layout, not source text rendered as monospace lines.
    expect(svg).toContain('<ellipse');
    expect(svg).not.toContain('font-family="monospace"');
    expect(svg).toContain('Administrator');
    expect(svg).toContain('Customer');
    expect(svg).toContain('CU-001');
    expect(svg).not.toMatch(/include|extend/);
  });

  it('rejects malformed generated-shaped source explicitly (renderer is the compatibility authority)', async () => {
    const malformed = 'erDiagram\n  this is $$$ not valid ((()))';
    await expect(
      provider().render({ format: 'MERMAID_ER', source: malformed }),
    ).rejects.toMatchObject({ code: 'DIAGRAM_INVALID_SOURCE' });
  });

  it('normalizes an unreachable renderer', async () => {
    await expect(
      provider({ baseUrl: 'http://127.0.0.1:1' }).render({
        format: 'MERMAID_ER',
        source: engine.generateER(erModel),
      }),
    ).rejects.toMatchObject({ code: 'DIAGRAM_PROVIDER_UNAVAILABLE' });
  });

  it('normalizes a real network timeout', async () => {
    // A non-routable address (RFC 5737-style black hole): the connection
    // attempt never completes, so this is a deterministic timeout
    // independent of how fast the local Kroki instance itself responds.
    await expect(
      provider({ baseUrl: 'http://10.255.255.1', timeoutMs: 300 }).render({
        format: 'MERMAID_ER',
        source: engine.generateER(erModel),
      }),
    ).rejects.toMatchObject({ code: 'DIAGRAM_PROVIDER_TIMEOUT' });
  }, 10_000);

  // Mermaid ER entity/attribute names shaped like HTML tags are rejected by
  // DiagramEngine.validate() before this request could ever be built (see
  // diagram-engine.spec.ts) — Mermaid's foreignObject-based label rendering
  // never sees them. svg-sanitizer.spec.ts separately proves the sanitizer
  // neutralizes that exact foreignObject/<img>/onerror shape regardless.
  // PlantUML places no such upstream restriction on actor names, so it is
  // the reachable end-to-end path for this vector against the real renderer.
  it('never lets a <script>/onerror/<img> payload survive real PlantUML rendering', async () => {
    const source = engine.generateUseCase({
      systemName: 'Sistema',
      useCases: [
        {
          code: 'CU-001',
          name: 'X',
          actors: ['<script>alert(1)</script>', '<img src=x onerror=alert(2)>'],
        },
      ],
    });
    engine.validate('PLANTUML', source);
    const rendered = await provider().render({ format: 'PLANTUML', source });
    const svg = sanitizeDiagramSvg(rendered.svg);

    // The payload must never survive as a functional script/element/handler...
    expect(svg).not.toMatch(/<script[\s>]/i);
    expect(svg).not.toMatch(/onerror\s*=/i);
    expect(svg).not.toMatch(/<img[\s/>]/i);
    // ...it is fine (expected, safe) for it to remain as inert escaped text.
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
