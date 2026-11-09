import { describe, expect, it } from 'vitest';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import { implementationReadinessProblems } from './implementation-readiness';

const plan = () =>
  implementationPlanContentSchema.parse({
    designBaselineId: '11111111-1111-4111-8111-111111111111',
    authentication: { required: false },
    modules: [{ localId: 'catalog', name: 'Catalog', description: 'Catálogo' }],
    entities: [
      {
        localId: 'item',
        name: 'Item',
        moduleLocalId: 'catalog',
        fields: [{ name: 'name', type: 'STRING' }],
        operations: ['CREATE', 'GET'],
      },
    ],
    routes: [
      {
        path: '/items/[id]',
        screenName: 'Artículo',
        moduleLocalId: 'catalog',
        entityLocalId: 'item',
        kind: 'DETAIL',
        actions: [{ label: 'Registrar copia', operation: 'CREATE' }],
      },
    ],
  });

describe('implementation readiness', () => {
  it('requires a server value when CRUD creation omits a required lifecycle field', () => {
    const value = plan();
    value.entities[0]!.fields[0]!.readOnly = true;
    expect(implementationReadinessProblems(value)).toContainEqual(
      expect.stringContaining('valor inicial del servidor'),
    );
    value.entities[0]!.fields[0]!.serverDefault = 'Initial';
    expect(implementationReadinessProblems(value)).toEqual([]);
  });
  it('keeps manual unauthenticated projects available and refuses unbound authentication or public credentials', () => {
    const value = plan();
    expect(implementationReadinessProblems(value)).toEqual([]);
    value.authentication.required = true;
    expect(implementationReadinessProblems(value)).toContainEqual(
      expect.stringContaining('no vincula'),
    );
    value.entities[0]!.fields.push({
      name: 'passwordHash',
      type: 'STRING',
      required: true,
      unique: false,
      enumValues: [],
    });
    expect(implementationReadinessProblems(value)).toContainEqual(
      expect.stringContaining('interno'),
    );
    value.entities[0]!.fields[1]!.internal = true;
    expect(implementationReadinessProblems(value)).toContainEqual(
      expect.stringContaining('operación específica'),
    );
  });
  it('does not infer the semantics of unrelated domain operations from their labels', () => {
    const value = plan();
    value.routes[0]!.actions[0]!.label = 'Registrar una anulación';
    expect(implementationReadinessProblems(value)).toEqual([]);
  });
});
