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
    // A primary key is not also marked unique.
    expect(first).toContain('uuid id PK\n');
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
    expect(source.indexOf('Ingresar')).toBeLessThan(source.indexOf('Comprar'));
  });
  it('draws the recorded include/extend relations, only between use cases in the diagram', () => {
    const source = engine.generateUseCase({
      systemName: 'Restaurante',
      useCases: [
        {
          code: 'CU-001',
          name: 'Registrar venta',
          actors: ['Cajero'],
          relations: [
            { kind: 'INCLUDE', targetCode: 'CU-002' },
            { kind: 'INCLUDE', targetCode: 'CU-009' },
          ],
        },
        { code: 'CU-002', name: 'Descontar existencias', actors: [] },
        {
          code: 'CU-003',
          name: 'Aplicar descuento',
          actors: ['Cajero'],
          relations: [{ kind: 'EXTEND', targetCode: 'CU-001' }],
        },
      ],
    });
    expect(source).toContain('rectangle "Restaurante" {');
    expect(source).toContain('U1 ..> U2 : <<include>>');
    expect(source).toContain('U3 ..> U1 : <<extend>>');
    expect(source.match(/ \.\.> /g)).toHaveLength(2);
    expect(() => engine.validate('PLANTUML', source)).not.toThrow();
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

  it('generates a deterministic Mermaid flowchart from the traceability graph, sorted by code, word-wrapping long titles instead of truncating them', () => {
    const source = engine.generateTraceabilityFlowchart({
      nodes: [
        { id: 'v2', code: 'RF-002', title: 'B' },
        {
          id: 'v1',
          code: 'RF-001',
          title: 'Un título extremadamente largo que supera cuarenta caracteres',
        },
      ],
      edges: [{ fromId: 'v1', toId: 'v2' }],
    });
    expect(source).toBe(
      'flowchart TD\n' +
        '  v1["RF-001: Un título extremadamente largo que supera cuarenta\\ncaracteres"]\n' +
        '  v2["RF-002: B"]\n' +
        '  v1 --> v2',
    );
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

  it('draws each layer as a package holding its components', () => {
    const source = engine.generateSoftwareComponentDiagram({
      components: [
        { localId: 'backend', name: 'Capa de aplicación' },
        { localId: 'sales', name: 'Ventas', layerLocalId: 'backend' },
        { localId: 'stock', name: 'Inventario', layerLocalId: 'backend' },
        { localId: 'web', name: 'Web' },
      ],
      dependencies: [{ fromLocalId: 'web', toLocalId: 'backend' }],
    });
    expect(source).toBe(
      [
        '@startuml',
        'package "Capa de aplicación" as backend {',
        '  component "Ventas" as sales',
        '  component "Inventario" as stock',
        '}',
        'component "Web" as web',
        'web --> backend',
        '@enduml',
      ].join('\n'),
    );
  });

  it('labels each link with its protocol and description', () => {
    const source = engine.generateSystemDeploymentDiagram({
      nodes: [
        { localId: 'api', name: 'API', kind: 'RUNTIME' },
        { localId: 'db', name: 'DB', kind: 'DATABASE' },
        { localId: 'ocr', name: 'OCR', kind: 'EXTERNAL_SERVICE' },
      ],
      links: [
        { fromLocalId: 'api', toLocalId: 'db', protocol: 'TCP', description: 'Consultas' },
        { fromLocalId: 'api', toLocalId: 'ocr', protocol: 'HTTPS' },
      ],
    });
    expect(source).toContain('api --> db : "TCP — Consultas"');
    expect(source).toContain('api --> ocr : "HTTPS"');
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

describe('DiagramEngine class diagram', () => {
  const engine = new DiagramEngine();
  const model = {
    classes: [
      {
        localId: 'order',
        name: 'Pedido de compra',
        attributes: [{ name: 'items', type: 'List<Item>', visibility: 'PUBLIC' }],
        methods: [
          { name: 'pay', parameters: [{ name: 'amount', type: 'number' }], returnType: 'void' },
        ],
      },
      { localId: 'person', name: 'Persona', stereotype: 'ABSTRACT', attributes: [], methods: [] },
      {
        localId: 'client',
        name: 'Cliente',
        attributes: [{ name: 'email', type: 'string' }],
        methods: [],
      },
    ],
    relationships: [
      {
        fromLocalId: 'client',
        toLocalId: 'order',
        kind: 'ASSOCIATION',
        label: 'realiza',
        fromMultiplicity: '1',
        toMultiplicity: '*',
      },
      { fromLocalId: 'client', toLocalId: 'person', kind: 'INHERITANCE' },
    ],
  };

  it('generates deterministic, validated Mermaid class source', () => {
    const source = engine.generateClassDiagram(model);
    expect(engine.generateClassDiagram({ ...model, classes: [...model.classes].reverse() })).toBe(
      source,
    );
    expect(() => engine.validate('MERMAID_CLASS', source)).not.toThrow();
    expect(source).toContain('class order["Pedido de compra"] {');
    expect(source).toContain('+List~Item~ items');
    expect(source).toContain('+pay(number amount) void');
    expect(source).toContain('<<abstract>>');
    expect(source).toContain('-string email');
    expect(source).toContain('client "1" --> "*" order : realiza');
    expect(source).toContain('person <|-- client');
  });

  it('keeps braces and semicolons out of the source', () => {
    const source = engine.generateClassDiagram({
      classes: [
        { localId: 'x', name: 'A;B', attributes: [{ name: 'c}', type: 'd{' }], methods: [] },
      ],
      relationships: [],
    });
    expect(() => engine.validate('MERMAID_CLASS', source)).not.toThrow();
  });
});
