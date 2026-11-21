import { describe, expect, it } from 'vitest';
import { DiagramEngine } from './diagram-engine';

describe('quality requirements in architecture diagrams', () => {
  it('keeps responsibilities and quality codes out of both architecture drawings', () => {
    const engine = new DiagramEngine();
    const details = {
      localId: 'audit',
      name: 'Auditoría',
      responsibilities: ['Registrar operaciones'],
      relatedSourceCodes: ['RNF-001'],
    };
    const component = engine.generateSoftwareComponentDiagram({
      components: [details],
      dependencies: [],
    });
    const deployment = engine.generateSystemDeploymentDiagram({
      nodes: [{ ...details, kind: 'STORAGE' }],
      links: [],
    });
    // They are shown in each element's card, not in the diagram.
    for (const source of [component, deployment]) {
      expect(source).toContain('Auditoría');
      expect(source).not.toContain('Registrar operaciones');
      expect(source).not.toContain('RNF-001');
    }
  });
});
