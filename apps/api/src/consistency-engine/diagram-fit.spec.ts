import { describe, expect, it } from 'vitest';
import { deploymentNodeWarnings } from './diagram-fit';

describe('deploymentNodeWarnings', () => {
  it('flags nodes that are not deployable elements, and nodes nothing talks to', () => {
    const warnings = deploymentNodeWarnings({
      nodes: [
        { localId: 'web', name: 'Navegador', kind: 'CLIENT' },
        { localId: 'app', name: 'Aplicación', kind: 'RUNTIME' },
        { localId: 'secrets', name: 'Gestión de secretos', kind: 'OTHER' },
        { localId: 'reports', name: 'Módulo de reportes', kind: 'RUNTIME' },
      ],
      links: [
        { fromLocalId: 'web', toLocalId: 'app' },
        { fromLocalId: 'secrets', toLocalId: 'app' },
      ],
    });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/^«Gestión de secretos» no es un cliente/);
    expect(warnings[1]).toMatch(/^«Módulo de reportes» no se comunica/);
  });

  it('accepts a plain deployment and tolerates missing content', () => {
    expect(
      deploymentNodeWarnings({
        nodes: [
          { localId: 'app', name: 'Aplicación', kind: 'RUNTIME' },
          { localId: 'db', name: 'PostgreSQL', kind: 'DATABASE' },
        ],
        links: [{ fromLocalId: 'app', toLocalId: 'db' }],
      }),
    ).toEqual([]);
    expect(deploymentNodeWarnings(null)).toEqual([]);
  });
});
