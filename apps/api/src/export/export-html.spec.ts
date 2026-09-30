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
  it('opens with an executive summary of counts and stage progress', () => {
    const data = baseExport('Demo');
    data.readiness.stages = [
      { satisfied: true, label: 'Fuentes' },
      { satisfied: false, label: 'Requisitos' },
    ] as FirstDeliverableExport['readiness']['stages'];
    data.traceabilitySummary.edgeCount = 7;
    const html = renderExportHtml(data);
    const summary = html.slice(html.indexOf('Resumen ejecutivo'), html.indexOf('Contenido'));
    expect(summary).toContain('1 de 2 etapas completas (50%)');
    expect(summary).toContain('<b>7</b><span>Relaciones de trazabilidad</span>');
    expect(summary).toContain('width:50%');
  });

  it('embeds trusted Stitch screenshot bytes without embedding provider HTML', () => {
    const data = baseExport('Proyecto seguro');
    const screenId = '11111111-1111-4111-8111-111111111111';
    data.mockups = [
      {
        code: 'MCK-001',
        generatorKind: 'STITCH',
        svg: null,
        screens: [
          {
            id: screenId,
            screenName: 'Inicio',
            screenLocalId: 'home',
            imageUrl: '/image',
            htmlUrl: '/html',
          },
        ],
      },
    ] as unknown as typeof data.mockups;
    const html = renderExportHtml(data, new Map([[screenId, 'data:image/png;base64,cG5n']]));
    expect(html).toContain('data:image/png;base64,cG5n');
    expect(html).toContain('Inicio');
    expect(html).not.toContain('href="/html"');
    // Mockup screenshots are embedded at their real (often large) resolution:
    // without this rule they overflow the printed page/exported sheet.
    expect(html).toMatch(/figure svg,figure img\{max-width:100%/);
  });
  for (const payload of XSS_PAYLOADS) {
    it(`never emits the raw payload unescaped: ${payload}`, () => {
      const html = renderExportHtml(baseExport(payload));
      expect(html).not.toContain(payload);
      expect(html).toContain(escapeHtml(payload));
    });
  }

  it('shows a safe placeholder instead of a broken <img> for a screen missing from the image map', () => {
    const data = baseExport('Proyecto seguro');
    const screenId = '11111111-1111-4111-8111-111111111111';
    data.mockups = [
      {
        code: 'MCK-001',
        generatorKind: 'STITCH',
        svg: null,
        screens: [{ id: screenId, screenName: 'Inicio', screenLocalId: 'home' }],
      },
    ] as unknown as typeof data.mockups;
    const html = renderExportHtml(data, new Map());
    expect(html).not.toContain('<img');
    expect(html).toContain('Imagen no disponible.');
  });

  it('renders the requirement quality report when present, and its absence when null', () => {
    const withQuality = baseExport('Proyecto seguro');
    withQuality.requirements = [
      {
        code: 'RF-001',
        requirement: { name: 'Registrar', description: 'd', priority: 'HIGH', actors: [] },
      },
    ] as unknown as typeof withQuality.requirements;
    withQuality.requirementQuality = {
      standard: 'ISO/IEC/IEEE 29148:2018-aligned',
      totalRequirements: 1,
      issues: [
        { requirementId: 'r1', code: 'RF-001', rule: 'BLANK_DESCRIPTION', message: 'Vacío.' },
      ],
    } as unknown as typeof withQuality.requirementQuality;
    const html = renderExportHtml(withQuality);
    expect(html).toContain('Calidad de requisitos');
    expect(html).toContain('Vacío.');

    const withoutQuality = baseExport('Proyecto seguro');
    expect(renderExportHtml(withoutQuality)).not.toContain('Calidad de requisitos');
  });

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

  it('keeps fixed export headings in Spanish while rendering approved English content', () => {
    const data = baseExport('English project');
    data.sources = [
      { code: 'F-001', source: { title: 'Interview' }, version: { status: 'APPROVED' } },
    ] as unknown as typeof data.sources;
    data.context = {
      problemStatement: 'Scheduling conflict',
      objective: 'Book equipment',
      actors: [{ name: 'Coordinator', description: 'Approves loans' }],
      needs: [{ description: 'Track loans' }],
      constraints: [{ description: 'Business hours' }],
      businessRules: [{ description: 'Return before closing' }],
      scopeItems: [
        { type: 'IN_SCOPE', description: 'Reservations' },
        { type: 'OUT_OF_SCOPE', description: 'Payments' },
      ],
      additionalContext: 'Campus',
      sources: [{ code: 'F-001', title: 'Interview' }],
    } as typeof data.context;
    data.requirements = [
      {
        code: 'RF-001',
        requirement: {
          name: 'Reserve',
          description: 'Reserve equipment',
          priority: 'HIGH',
          actors: ['Coordinator'],
          requirementType: 'FUNCTIONAL',
        },
      },
    ] as unknown as typeof data.requirements;
    data.useCases = [
      {
        code: 'CU-001',
        useCase: {
          name: 'Reserve equipment',
          objective: 'Create booking',
          primaryActor: 'Coordinator',
          secondaryActors: [],
          preconditions: [],
          postconditions: [],
          mainFlow: [{ actor: 'Coordinator', action: 'Selects equipment' }],
          alternativeFlows: [],
        },
      },
    ] as unknown as typeof data.useCases;
    data.dataModel = {
      entities: [
        {
          localId: 'equipment',
          name: 'Equipment',
          attributes: [
            { name: 'id', type: 'string', required: true, primaryKey: true, unique: true },
          ],
        },
      ],
      relationships: [
        {
          sourceEntityId: 'equipment',
          targetEntityId: 'equipment',
          sourceCardinality: 'ONE',
          targetCardinality: 'ZERO_OR_MORE',
        },
      ],
    } as unknown as typeof data.dataModel;
    data.navigation = {
      content: { nodes: [{ localId: 'home', label: 'Home', viewName: 'Home', kind: 'HOME' }] },
    } as unknown as typeof data.navigation;
    data.softwareArchitecture = {
      content: {
        style: 'Modular monolith',
        components: [{ name: 'Loans', responsibilities: ['Reservations'] }],
        decisions: ['Use REST'],
      },
    } as unknown as typeof data.softwareArchitecture;
    data.systemArchitecture = {
      content: {
        boundary: 'Campus',
        nodes: [{ localId: 'api', name: 'API', kind: 'SERVICE', responsibilities: ['Loans'] }],
        links: [{ fromLocalId: 'api', toLocalId: 'api', protocol: 'HTTP' }],
      },
    } as unknown as typeof data.systemArchitecture;
    data.uiBlueprint = {
      content: {
        screens: [
          {
            name: 'Booking',
            purpose: 'Reserve',
            targetActors: ['Coordinator'],
            sections: ['Form'],
            primaryActions: ['Submit'],
            secondaryActions: [],
            principalData: ['Equipment'],
            forms: ['Booking'],
          },
        ],
      },
    } as unknown as typeof data.uiBlueprint;
    data.mockups = [
      { code: 'UI-001', generatorKind: 'INTERNAL_WIREFRAME', svg: '<svg></svg>', screens: null },
    ] as unknown as typeof data.mockups;
    data.readiness.ready = true;
    data.readiness.stages = [
      { satisfied: true, label: 'Design', summary: 'Approved' },
    ] as typeof data.readiness.stages;
    data.readiness.blockers = [];
    data.readiness.warnings = [];
    data.traceabilitySummary.truncated = true;

    const html = renderExportHtml(data);

    expect(html).toContain('<html lang="es">');
    expect(html).toContain('Fuentes del proyecto');
    expect(html).toContain('Modelo de datos');
    expect(html).toContain('Todas las etapas están completas.');
    expect(html).toContain('Book equipment');
    expect(html).toContain('Reserve equipment');
  });
});
