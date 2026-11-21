import { describe, expect, it } from 'vitest';
import { coherenceGaps } from '../consistency-engine/coherence-rules';
import { evaluateStructuredGeneration } from './structured-generation-quality';
import { implementationReadinessProblems } from '../construction/implementation-readiness';
import {
  completeLocalAuthentication,
  bindAuthenticationActions,
} from './implementation-plan-authentication';
import {
  finishImplementationPlan,
  finishRoutes,
  type IpEntity,
  type IpRoute,
} from './implementation-plan-batches';

const BASELINE = '11111111-1111-4111-8111-111111111111';
const skeleton = {
  authentication: { required: true, roles: ['Admin', 'Clerk'] },
  modules: [{ localId: 'identity', name: 'Identity', description: 'Cuentas' }],
  envVars: [],
};
// An account as a model draws it: role as a field, an optional read-only
// hash and a separate salt.
const account: IpEntity = {
  localId: 'staff',
  name: 'StaffAccount',
  moduleLocalId: 'identity',
  classLocalId: 'staff-class',
  fields: [
    { name: 'login', type: 'STRING', required: true, unique: true, enumValues: [] },
    {
      name: 'passwordHash',
      type: 'STRING',
      required: false,
      unique: false,
      internal: true,
      readOnly: true,
      enumValues: [],
    },
    {
      name: 'passwordSalt',
      type: 'STRING',
      required: false,
      unique: false,
      internal: true,
      enumValues: [],
    },
    { name: 'role', type: 'ENUM', required: false, unique: false, enumValues: ['ADMIN', 'CLERK'] },
  ],
  relations: [],
  operations: ['LIST', 'GET', 'CREATE', 'UPDATE'],
  readRoles: ['Admin'],
  writeRoles: ['Admin'],
};
const route = (path: string, actions: IpRoute['actions'], extra: Partial<IpRoute> = {}) =>
  ({
    path,
    screenName: path,
    moduleLocalId: 'identity',
    kind: 'CUSTOM',
    actions,
    ...extra,
  }) as IpRoute;

describe('local authentication of an AI plan (ADR-026)', () => {
  it('completes the account, adds roles and sessions, and binds the access actions', () => {
    const done = completeLocalAuthentication(skeleton, [account]);
    const staff = done.entities.find((entity) => entity.localId === 'staff')!;
    expect(staff.fields.map((field) => field.name)).toEqual(['login', 'passwordHash', 'status']);
    expect(staff.fields[1]).toMatchObject({ internal: true, required: true });
    expect(staff.fields[1]!.readOnly).toBeUndefined();
    expect(staff.relations).toContainEqual(
      expect.objectContaining({ name: 'roles', kind: 'MANY_TO_MANY', targetEntityLocalId: 'role' }),
    );
    expect(done.skeleton.authentication.local).toMatchObject({
      userEntityLocalId: 'staff',
      loginField: 'login',
      statusField: 'status',
      activeStatus: 'ACTIVE',
      sessionEntityLocalId: 'session',
    });

    const routes = finishRoutes(
      {
        customEndpoints: done.endpoints,
        routes: [
          // The model served sign-in with the account's CREATE.
          route('/login', [{ label: 'Iniciar sesión', operation: 'CREATE' }], {
            kind: 'FORM',
            entityLocalId: 'staff',
          }),
          route('/home', [{ label: 'Ver cuentas', navigation: { routePath: '/accounts' } }]),
          route('/accounts', [{ label: 'Registrar cuenta', operation: 'CREATE' }], {
            kind: 'LIST',
            entityLocalId: 'staff',
            contextQueries: ['GET /missing'],
          }),
        ],
      },
      [],
      done.entities,
    );
    expect(routes.routes[0]).toMatchObject({
      entityLocalId: undefined,
      actions: [{ label: 'Iniciar sesión', endpoint: 'POST /auth/login' }],
    });
    expect(routes.routes[2]!.contextQueries).toBeUndefined();

    const plan = finishImplementationPlan(done.skeleton, done.entities, routes, BASELINE);
    expect(implementationReadinessProblems(plan as never)).toEqual([]);
    // What authentication adds names no class or screen, and is no gap.
    const screen = (localId: string, primaryActions: string[]) => ({
      localId,
      name: localId,
      purpose: localId,
      targetActors: [],
      relatedUseCaseCodes: [],
      sections: [],
      primaryActions,
      secondaryActions: [],
      principalData: [],
      forms: [],
      states: [],
    });
    const screens = [screen('login', ['Iniciar sesión']), screen('home', ['Ver cuentas'])];
    screens.push(screen('accounts', ['Registrar cuenta']));
    const drawn = {
      ...plan,
      designBaselineId: BASELINE,
      routes: plan.routes.map((item) =>
        item.path === '/logout' ? item : { ...item, screenLocalId: item.path.slice(1) },
      ),
    };
    const classes = [
      {
        localId: 'staff-class',
        name: 'StaffAccount',
        stereotype: 'ENTITY',
        attributes: [],
        operations: [],
      },
    ];
    expect(
      coherenceGaps('IMPLEMENTATION_PLAN', drawn, { classes, screens } as never).map(
        (gap) => gap.message,
      ),
    ).toEqual([]);
    // Nor does the quality review count the access actions it adds to a screen.
    expect(
      evaluateStructuredGeneration('IMPLEMENTATION_PLAN', drawn, [
        { code: 'UI-001', type: 'UI_BLUEPRINT', content: { screens } },
      ] as never).filter((finding) => finding.code === 'UNKNOWN_SCREEN_ACTION'),
    ).toEqual([]);
  });

  it('leaves a plan alone when sign-in is not required or already bound', () => {
    const open = { ...skeleton, authentication: { required: false, roles: [] } };
    expect(completeLocalAuthentication(open, [account]).endpoints).toEqual([]);
    const accumulated = { routes: [route('/x', [{ label: 'Iniciar sesión', operation: 'GET' }])] };
    expect(bindAuthenticationActions({ ...accumulated, customEndpoints: [] })).toEqual({
      ...accumulated,
      customEndpoints: [],
    });
  });
});
