import { describe, expect, it } from 'vitest';
import { DiagramEngine } from './diagram-engine';

describe('quality requirements in architecture diagrams', () => {
  it('shows declared responsibilities and requirement codes in component and deployment diagrams', () => {
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
    for (const source of [component, deployment]) {
      expect(source).toContain('note right of audit');
      expect(source).toContain('Registrar operaciones');
      expect(source).toContain('RNF-001');
    }
  });
});
