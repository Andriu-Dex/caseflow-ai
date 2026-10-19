import { describe, expect, it } from 'vitest';
import { DiagramEngine } from './diagram-engine';

describe('quality requirements in architecture diagrams', () => {
  it('shows the quality requirement codes in the component diagram, and responsibilities and codes in the deployment diagram', () => {
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
    // The component diagram keeps only the quality codes, short; the rest is in the card.
    expect(component).toContain('note right of audit');
    expect(component).toContain('RNF-001');
    expect(component).not.toContain('Registrar operaciones');
    expect(deployment).toContain('note right of audit');
    expect(deployment).toContain('Registrar operaciones');
    expect(deployment).toContain('RNF-001');
  });
});
