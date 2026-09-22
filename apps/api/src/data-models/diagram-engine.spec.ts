import { describe, expect, it } from 'vitest';
import { DiagramEngine } from './diagram-engine';

describe('DiagramEngine', () => {
  const engine = new DiagramEngine();
  it('generates deterministic validated Mermaid ER and safe SVG', () => {
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
    expect(engine.renderSvg('MERMAID_ER', first)).toMatch(/^<svg[^>]+>/);
  });
  it('deduplicates actors and never invents include/extend', () => {
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
    expect(engine.renderSvg('PLANTUML', source)).not.toContain('<script');
  });
  it('rejects unsafe or malformed source', () => {
    expect(() => engine.validate('PLANTUML', '@startuml\n!include evil\n@enduml')).toThrow(
      'no válida',
    );
    expect(() => engine.validate('MERMAID_ER', 'graph TD; shell')).toThrow('no válida');
  });
});
