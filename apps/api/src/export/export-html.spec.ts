import { describe, expect, it } from 'vitest';
import type { FirstDeliverableExport } from '@caseflow-ai/contracts';
import { escapeHtml, renderExportHtml } from './export-html';

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">link</a>',
  '</style><script>alert(1)</script>',
  `"quotes" & 'ampersands'`,
];

function baseExport(malicious: string): FirstDeliverableExport {
  return {
    projectId: '11111111-1111-1111-1111-111111111111',
    projectName: malicious,
    generatedAt: new Date().toISOString(),
    sources: [],
    context: null,
    requirements: [],
    requirementQuality: null,
    useCases: [],
    useCaseDiagram: null,
    dataModel: null,
    erDiagram: null,
    navigation: null,
    navigationDiagram: null,
    softwareArchitecture: null,
    softwareArchitectureDiagram: null,
    systemArchitecture: null,
    systemArchitectureDiagram: null,
    uiBlueprint: null,
    mockups: [],
    traceabilitySummary: { nodeCount: 0, edgeCount: 0, truncated: false },
    stalenessSummary: { projectId: 'p', generatedAt: new Date().toISOString(), entries: [] },
    readiness: {
      projectId: 'p',
      generatedAt: new Date().toISOString(),
      ready: false,
      stages: [],
      blockers: [malicious],
      warnings: [malicious],
    },
  } as unknown as FirstDeliverableExport;
}

describe('escapeHtml', () => {
  it('escapes the five special HTML characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});

describe('renderExportHtml', () => {
  for (const payload of XSS_PAYLOADS) {
    it(`never emits the raw payload unescaped: ${payload}`, () => {
      const html = renderExportHtml(baseExport(payload));
      expect(html).not.toContain(payload);
      expect(html).toContain(escapeHtml(payload));
    });
  }

  it('embeds only already-sanitized diagram/mockup svg, never re-escaping it', () => {
    const data = baseExport('Proyecto seguro');
    data.erDiagram = {
      code: 'MD-001',
      versionId: '22222222-2222-2222-2222-222222222222',
      kind: 'ER',
      sourceFormat: 'MERMAID_ER',
      source: 'erDiagram',
      svg: '<svg><text>ok</text></svg>',
      sourceArtifactVersionIds: [],
    };
    const html = renderExportHtml(data);
    expect(html).toContain('<svg><text>ok</text></svg>');
  });
});
