import { describe, expect, it } from 'vitest';
import {
  navigationTreeContentSchema,
  softwareArchitectureContentSchema,
  systemArchitectureContentSchema,
  uiBlueprintContentSchema,
} from './structured-analysis.contract';

describe('navigation tree content', () => {
  const home = { localId: 'home', label: 'Home', viewName: 'Home', kind: 'HOME' as const };

  it('accepts a valid tree with a parent/child relationship', () => {
    const orders = { ...home, localId: 'orders', label: 'Orders', parentLocalId: 'home' };
    expect(navigationTreeContentSchema.safeParse({ nodes: [home, orders] }).success).toBe(true);
  });

  it('rejects duplicate localId', () => {
    expect(navigationTreeContentSchema.safeParse({ nodes: [home, { ...home }] }).success).toBe(
      false,
    );
  });

  it('rejects a parentLocalId that does not exist', () => {
    expect(
      navigationTreeContentSchema.safeParse({
        nodes: [{ ...home, parentLocalId: 'missing' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a node that is its own parent', () => {
    expect(
      navigationTreeContentSchema.safeParse({
        nodes: [{ ...home, parentLocalId: 'home' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a parent chain that forms a cycle', () => {
    const a = { ...home, localId: 'a', parentLocalId: 'b' };
    const b = { ...home, localId: 'b', parentLocalId: 'a' };
    expect(navigationTreeContentSchema.safeParse({ nodes: [a, b] }).success).toBe(false);
  });
});

describe('software architecture content', () => {
  const base = { style: 'Modular monolith', decisions: [] };
  const api = { localId: 'api', name: 'API', responsibilities: [] };
  const web = { localId: 'web', name: 'Web', responsibilities: [] };

  it('accepts a valid architecture with a resolvable dependency', () => {
    expect(
      softwareArchitectureContentSchema.safeParse({
        ...base,
        components: [api, web],
        dependencies: [{ fromLocalId: 'web', toLocalId: 'api' }],
      }).success,
    ).toBe(true);
  });

  it('rejects duplicate component localId', () => {
    expect(
      softwareArchitectureContentSchema.safeParse({
        ...base,
        components: [api, { ...api }],
        dependencies: [],
      }).success,
    ).toBe(false);
  });

  it('rejects a dependency referencing a nonexistent component', () => {
    expect(
      softwareArchitectureContentSchema.safeParse({
        ...base,
        components: [api],
        dependencies: [{ fromLocalId: 'api', toLocalId: 'missing' }],
      }).success,
    ).toBe(false);
  });
});

describe('system architecture content', () => {
  const base = { boundary: 'Sistema' };
  const server = {
    localId: 'server',
    name: 'Server',
    kind: 'RUNTIME' as const,
    responsibilities: [],
  };
  const db = { localId: 'db', name: 'Database', kind: 'DATABASE' as const, responsibilities: [] };

  it('accepts a valid system with a resolvable link', () => {
    expect(
      systemArchitectureContentSchema.safeParse({
        ...base,
        nodes: [server, db],
        links: [{ fromLocalId: 'server', toLocalId: 'db' }],
      }).success,
    ).toBe(true);
  });

  it('rejects duplicate node localId', () => {
    expect(
      systemArchitectureContentSchema.safeParse({
        ...base,
        nodes: [server, { ...server }],
        links: [],
      }).success,
    ).toBe(false);
  });

  it('rejects a link referencing a nonexistent node', () => {
    expect(
      systemArchitectureContentSchema.safeParse({
        ...base,
        nodes: [server],
        links: [{ fromLocalId: 'server', toLocalId: 'missing' }],
      }).success,
    ).toBe(false);
  });
});

describe('UI blueprint content', () => {
  const screen = {
    localId: 'home',
    name: 'Inicio',
    purpose: 'Ver el panel',
    targetActors: [],
    relatedUseCaseCodes: [],
    sections: [],
    primaryActions: [],
    secondaryActions: [],
    principalData: [],
    forms: [],
    states: [],
  };

  it('accepts a valid blueprint', () => {
    expect(uiBlueprintContentSchema.safeParse({ screens: [screen] }).success).toBe(true);
  });

  it('rejects duplicate screen localId', () => {
    expect(uiBlueprintContentSchema.safeParse({ screens: [screen, { ...screen }] }).success).toBe(
      false,
    );
  });
});
