import { describe, expect, it } from 'vitest';
import { DiagramEngine } from './diagram-engine';

describe('DiagramEngine', () => {
  const engine = new DiagramEngine();
  it('generates deterministic validated Mermaid ER source', () => {
    const model = {
      entities: [
        {
          localId: 'user',
          name: 'User',
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
          sourceEntityId: 'user',
          targetEntityId: 'order',
          sourceCardinality: 'ONE',
          targetCardinality: 'ZERO_OR_MORE',
          name: 'places',
        },
      ],
    };
    const first = engine.generateER(model);
    expect(engine.generateER(model)).toBe(first);
    expect(first).toContain('user ||--o{ order');
    expect(() => engine.validate('MERMAID_ER', first)).not.toThrow();
  });
  it('deduplicates the diagram-wide actor list and never invents include/extend', () => {
    const source = engine.generateUseCase({
      systemName: 'Sistema',
      useCases: [
        { code: 'CU-002', name: 'Comprar', actors: ['Cliente'] },
        { code: 'CU-001', name: 'Ingresar', actors: ['Cliente', 'Admin'] },
      ],
    });
    expect(source.match(/actor "Cliente"/g)).toHaveLength(1);
    expect(source).not.toMatch(/include|extend/);
    expect(source.indexOf('CU-001')).toBeLessThan(source.indexOf('CU-002'));
  });
  it('deduplicates duplicate actor entries within the same use case', () => {
    // Historical/malformed data: the primary actor repeated in secondaryActors.
    const source = engine.generateUseCase({
      systemName: 'Sistema',
      useCases: [{ code: 'CU-001', name: 'Ingresar', actors: ['Cliente', 'Cliente', ' Cliente '] }],
    });
    expect(source.match(/actor "Cliente"/g)).toHaveLength(1);
    expect(source.match(/-- U1/g)).toHaveLength(1);
  });
  it('orders actors and use cases ordinally, independent of locale', () => {
    // Under a default/locale-aware compare these could sort differently
    // (e.g. case-insensitive or accent-aware locales); ordinal comparison is
    // stable across every machine regardless of OS/ICU locale.
    const source = engine.generateUseCase({
      systemName: 'Sistema',
      useCases: [
        { code: 'CU-001', name: 'A', actors: ['b', 'A', 'Z', 'a'] },
        { code: 'CU-002', name: 'B', actors: [] },
      ],
    });
    const order = ['A', 'Z', 'a', 'b'].map((actor) => source.indexOf(`actor "${actor}"`));
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });
  it('rejects unsafe or malformed source', () => {
    expect(() => engine.validate('PLANTUML', '@startuml\n!include evil\n@enduml')).toThrow(
      'no válida',
    );
    expect(() => engine.validate('MERMAID_ER', 'graph TD; shell')).toThrow('no válida');
  });
  it('rejects Mermaid ER entity/attribute names shaped like HTML tags before they ever reach a renderer', () => {
    // Mermaid's own ER renderer lays out labels through an HTML foreignObject
    // (see svg-sanitizer.spec.ts); blocking angle brackets here means a
    // <script>/<img>-shaped name never leaves this process at all.
    const withMarkup = {
      entities: [
        {
          localId: 'a',
          name: '<script>alert(1)</script>',
          attributes: [{ name: 'id', type: 'UUID', primaryKey: true, unique: true }],
        },
      ],
      relationships: [],
    };
    expect(() => engine.validate('MERMAID_ER', engine.generateER(withMarkup))).toThrow('no válida');
  });

  it('generates a deterministic Mermaid flowchart from a navigation tree, with and without a parent', () => {
    const source = engine.generateNavigationFlowchart({
      nodes: [
        { localId: 'home', label: 'Home' },
        { localId: 'orders', label: 'Orders', parentLocalId: 'home' },
      ],
    });
    expect(source).toBe('flowchart TD\n  home["Home"]\n  orders["Orders"]\n  home --> orders');
    expect(() => engine.validate('MERMAID_FLOWCHART', source)).not.toThrow();
  });

  it('generates a deterministic PlantUML component diagram, with and without a dependency description', () => {
    const source = engine.generateSoftwareComponentDiagram({
      components: [
        { localId: 'api', name: 'API' },
        { localId: 'web', name: 'Web' },
      ],
      dependencies: [
        { fromLocalId: 'web', toLocalId: 'api', description: 'calls' },
        { fromLocalId: 'web', toLocalId: 'api' },
      ],
    });
    expect(source).toContain('component "API" as api');
    expect(source).toContain('web --> api : "calls"');
    expect(source).toContain('web --> api\n');
    expect(() => engine.validate('PLANTUML_COMPONENT', source)).not.toThrow();
  });

  it('generates a deterministic PlantUML deployment diagram, with and without a link description', () => {
    const source = engine.generateSystemDeploymentDiagram({
      nodes: [
        { localId: 'server', name: 'Server', kind: 'RUNTIME' },
        { localId: 'db', name: 'Database', kind: 'DATABASE' },
        { localId: 'other', name: 'Other', kind: 'UNKNOWN_KIND' },
      ],
      links: [
        { fromLocalId: 'server', toLocalId: 'db', description: 'reads/writes' },
        { fromLocalId: 'server', toLocalId: 'other' },
      ],
    });
    expect(source).toContain('server --> db : "reads/writes"');
    expect(source).toContain('server --> other\n');
    // An unrecognized kind falls back to the generic 'node' keyword.
    expect(source).toContain('node "Other" as other');
    expect(() => engine.validate('PLANTUML_DEPLOYMENT', source)).not.toThrow();
  });
});
