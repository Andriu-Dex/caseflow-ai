import { BusinessLogicService } from '../../construction/business-logic.service';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { CASEFLOW_WEB_TS_V2 } from '@caseflow-ai/domain';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import { generateProject } from './project-generator';
import { generateOpenApi } from '../openapi.generator';
import { implementationReadinessProblems } from '../../construction/implementation-readiness';
import { coherenceGaps, upstreamFromSources } from '../../consistency-engine/coherence-rules';

const field = (name: string, type = 'STRING', extra = {}) => ({ name, type, ...extra });
const planInput = () => ({
  designBaselineId: '11111111-1111-4111-8111-111111111111',
  authentication: {
    required: true,
    roles: ['EDITOR', 'READER'],
    local: {
      userEntityLocalId: 'member',
      loginField: 'handle',
      passwordHashField: 'secretDigest',
      statusField: 'state',
      activeStatus: 'ENABLED',
      roleRelation: 'groups',
      roleNameField: 'label',
      sessionEntityLocalId: 'connection',
      sessionUserRelation: 'member',
      startedAtField: 'openedAt',
      lastActivityAtField: 'seenAt',
      invalidatedAtField: 'closedAt',
      sessionStatusField: 'state',
      activeSessionStatus: 'OPEN',
      closedSessionStatus: 'CLOSED',
    },
  },
  modules: [{ localId: 'identity', name: 'Identity', description: 'Identidad' }],
  entities: [
    {
      localId: 'member',
      name: 'Member',
      moduleLocalId: 'identity',
      fields: [
        field('handle', 'STRING', { unique: true }),
        field('secretDigest', 'STRING', { internal: true }),
        field('state'),
      ],
      relations: [{ name: 'groups', kind: 'MANY_TO_MANY', targetEntityLocalId: 'group' }],
      operations: ['LIST', 'GET', 'CREATE', 'UPDATE'],
      readRoles: ['EDITOR'],
      writeRoles: ['EDITOR'],
    },
    {
      localId: 'group',
      name: 'Group',
      moduleLocalId: 'identity',
      fields: [field('label', 'STRING', { unique: true })],
      operations: ['LIST'],
    },
    {
      localId: 'connection',
      name: 'Connection',
      moduleLocalId: 'identity',
      fields: [
        field('openedAt', 'DATETIME'),
        field('seenAt', 'DATETIME'),
        field('closedAt', 'DATETIME', { required: false }),
        field('state'),
      ],
      relations: [
        { name: 'member', kind: 'MANY_TO_ONE', targetEntityLocalId: 'member', required: true },
      ],
      operations: [],
    },
  ],
  customEndpoints: [
    {
      moduleLocalId: 'identity',
      method: 'POST',
      path: '/auth/login',
      summary: 'Iniciar sesión',
      builtin: 'LOGIN',
    },
    {
      moduleLocalId: 'identity',
      method: 'POST',
      path: '/auth/logout',
      summary: 'Cerrar sesión',
      builtin: 'LOGOUT',
    },
    {
      moduleLocalId: 'identity',
      method: 'GET',
      path: '/auth/options',
      summary: 'Consultar opciones',
      builtin: 'AUTHORIZED_OPTIONS',
    },
  ],
  routes: [
    {
      path: '/signin',
      screenName: 'Acceso',
      screenLocalId: 'signin',
      moduleLocalId: 'identity',
      kind: 'FORM',
      actions: [{ label: 'Iniciar sesión', endpoint: 'POST /auth/login' }],
    },
    {
      path: '/signout',
      screenName: 'Cerrar sesión',
      screenLocalId: 'signout',
      moduleLocalId: 'identity',
      kind: 'CUSTOM',
      actions: [{ label: 'Cerrar sesión', endpoint: 'POST /auth/logout' }],
    },
    {
      path: '/home',
      screenName: 'Inicio',
      screenLocalId: 'home',
      moduleLocalId: 'identity',
      kind: 'CUSTOM',
      actions: [{ label: 'Consultar opciones', endpoint: 'GET /auth/options' }],
    },
    {
      path: '/members/new',
      screenName: 'Registrar persona',
      screenLocalId: 'member-form',
      moduleLocalId: 'identity',
      entityLocalId: 'member',
      kind: 'FORM',
      actions: [{ label: 'Guardar', operation: 'CREATE' }],
    },
  ],
});

describe('local authentication generation', () => {
  it('opens the application on its login, then on the home screen, never on a screen index', () => {
    const files = generateProject({
      plan: implementationPlanContentSchema.parse(planInput()),
      template: CASEFLOW_WEB_TS_V2,
      projectName: 'Biblioteca',
      slug: 'library',
    });
    const root = files.find((file) => file.path === 'apps/web/app/page.tsx')!.content;
    expect(root).toContain('router.replace(accessToken.get() ? "/home" : "/signin")');
    expect(root).not.toContain('<Link');
    const e2e = files.find((file) => file.path === 'apps/web/e2e/screens.spec.ts')!.content;
    expect(e2e).toContain('the application opens on its login without a session');
  });

  it('rejects creating an account as the implementation of deactivating that account', () => {
    const input = planInput();
    input.routes.push({
      path: '/members/[id]',
      screenName: 'Cuenta',
      screenLocalId: 'account-detail',
      moduleLocalId: 'identity',
      entityLocalId: 'member',
      kind: 'DETAIL',
      actions: [{ label: 'Desactivar cuenta', operation: 'CREATE' }],
    });
    expect(
      implementationReadinessProblems(implementationPlanContentSchema.parse(input)),
    ).toContainEqual(expect.stringContaining('no puede crear otro registro'));
  });
  it('keeps a canonical /access login page instead of generating a duplicate or redirecting it to itself', () => {
    const input = planInput();
    input.routes[0]!.path = '/access';
    const plan = implementationPlanContentSchema.parse(input);
    const files = generateProject({
      plan,
      template: CASEFLOW_WEB_TS_V2,
      projectName: 'Biblioteca',
      slug: 'library',
    });
    const access = files.filter((file) => file.path === 'apps/web/app/access/page.tsx');
    expect(access).toHaveLength(1);
    expect(access[0]!.content).toContain('api.postAuthLogin');
    expect(access[0]!.content).not.toContain('redirect(');
  });
  it('uses explicit generic mappings, protects secret fields in every public layer and emits real authentication forms', () => {
    const plan = implementationPlanContentSchema.parse(planInput());
    const files = generateProject({
      plan,
      template: CASEFLOW_WEB_TS_V2,
      projectName: 'Biblioteca',
      slug: 'library',
    });
    const get = (path: string) => files.find((file) => file.path === path)!.content;
    expect(get('prisma/schema.prisma')).toContain('secretDigest');
    expect(get('packages/contracts/src/index.ts')).not.toContain('secretDigest:');
    // A malformed login body is recorded as a failed access before it is rejected.
    const controller = get('apps/api/src/auth/local-auth.controller.ts');
    expect(controller).toMatch(
      /catch \(failure\) \{ await this\.auth\.recordRejectedLogin\(\); throw failure; \}/,
    );
    expect(get('apps/api/src/auth/local-auth.service.ts')).toContain(
      "recordRejectedLogin() { return this.recordAccess(null, 'FAILURE'); }",
    );
    expect(get('apps/web/app/signin/page.tsx')).toContain('<PasswordInput id="password"');
    expect(get('apps/web/app/signin/page.tsx')).toContain('api.postAuthLogin');
    expect(get('apps/web/app/signin/page.tsx')).not.toContain('listMembers');
    expect(get('apps/web/app/members/new/page.tsx')).not.toContain('secretDigest');
    expect(get('apps/api/src/identity/member.service.ts')).toContain('argon2.argon2id');
    expect(get('apps/api/src/identity/member.service.ts')).toContain(
      'omit: { secretDigest: true }',
    );
    expect(get('apps/api/src/identity/member.service.ts')).toContain('tx.connection.updateMany');
    expect(get('apps/api/src/auth/local-auth.service.ts')).toContain(
      'this.prisma.connection.findUnique',
    );
    expect(get('apps/api/src/auth/local-auth.service.ts')).toContain('session.member.state');
    expect(get('apps/api/src/auth/local-auth.service.ts')).toContain('AUTH_LOGIN_MAX_ATTEMPTS');
    expect(get('apps/api/src/auth/auth.guard.ts')).toContain('await this.auth.authenticate');
    expect(get('apps/api/src/auth/safe-response.interceptor.ts')).toContain('secretDigest');
    expect(get('apps/api/src/app.module.ts')).not.toContain('DevLoginController');
    expect(files.some((file) => file.path.includes('/auth/dev-'))).toBe(false);
    const doc = generateOpenApi(plan, 'Biblioteca') as {
      paths: Record<string, Record<string, { security?: unknown[] }>>;
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.paths['/auth/login']!.post!.security).toEqual([]);
    expect(doc.paths['/auth/options']!.get!.security).toEqual([{ bearerAuth: [] }]);
    expect(JSON.stringify(doc.components.schemas.Member)).not.toContain('secretDigest');
    expect(get('packages/api-client/src/index.ts')).toContain('postAuthLogin');
    expect(get('packages/api-client/src/index.ts')).not.toContain('secretDigest');
    for (const file of files.filter(
      (file) => /\.tsx?$/.test(file.path) && !file.path.endsWith('.d.ts'),
    )) {
      const diagnostics =
        ts.transpileModule(file.content, {
          fileName: file.path,
          reportDiagnostics: true,
          compilerOptions: { jsx: ts.JsxEmit.Preserve, experimentalDecorators: true },
        }).diagnostics ?? [];
      expect(
        diagnostics.filter((item) => item.category === ts.DiagnosticCategory.Error),
        file.path,
      ).toEqual([]);
    }
  });
  it('passes the verified actor into custom handlers and the versioned business-logic task', async () => {
    const input = planInput();
    input.customEndpoints.push({
      moduleLocalId: 'identity',
      method: 'GET',
      path: '/report',
      summary: 'Consultar datos propios',
    } as (typeof input.customEndpoints)[number]);
    const plan = implementationPlanContentSchema.parse(input);
    const ai = {
      generateStructured: vi
        .fn()
        .mockResolvedValue({ data: { body: 'return { userId: actor.userId };' } }),
    };
    const checkpointRead = vi.fn().mockResolvedValue(null);
    const service = new BusinessLogicService(
      {
        project: { findUnique: vi.fn().mockResolvedValue({ language: 'ES' }) },
        generatedFile: {
          findFirst: checkpointRead,
          upsert: vi.fn().mockResolvedValue({}),
        },
        generationRun: { findFirst: vi.fn().mockResolvedValue({ id: 'r' }) },
        designBaseline: {
          findFirst: vi.fn().mockResolvedValue({
            entries: [
              {
                role: 'GENERATION_PLAN',
                artifactVersion: {
                  projectId: 'p',
                  structuredAnalysisDetail: {
                    content: {
                      summary: 'Identidad',
                      modules: [
                        { localId: 'identity', name: 'Identidad', purpose: 'Administrar cuentas' },
                      ],
                      authentication: { required: true },
                    },
                  },
                },
              },
              {
                role: 'UI_BLUEPRINT',
                artifactVersion: {
                  projectId: 'p',
                  structuredAnalysisDetail: {
                    content: {
                      screens: [{ localId: 'home', name: 'Inicio', purpose: 'Consultar opciones' }],
                    },
                  },
                },
              },
            ],
          }),
        },
      } as never,
      ai as never,
    );
    const result = await service.implement('p', 'r', plan, CASEFLOW_WEB_TS_V2);
    expect(result.checkpoints).toHaveLength(1);
    expect(checkpointRead.mock.calls[0]![0].where.generationRun).toEqual({
      projectId: 'p',
      designBaselineId: plan.designBaselineId,
    });
    checkpointRead.mockResolvedValue({ content: result.checkpoints![0]!.content });
    const retried = await service.implement('p', 'r', plan, CASEFLOW_WEB_TS_V2);
    expect(retried.implementations).toEqual(result.implementations);
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    const request = ai.generateStructured.mock.calls[0]![0];
    expect(request.promptVersion).toBe(4);
    expect(JSON.parse(request.messages[0].content).action.parameters).toContainEqual(
      expect.objectContaining({ name: 'actor' }),
    );
    const files = generateProject(
      { plan, template: CASEFLOW_WEB_TS_V2, projectName: 'Biblioteca', slug: 'library' },
      result.implementations,
    );
    expect(
      files.find((file) => file.path === 'apps/api/src/identity/identity-actions.controller.ts')!
        .content,
    ).toContain('request.user');
    expect(
      files.find((file) => file.path === 'apps/api/src/identity/identity-actions.service.ts')!
        .content,
    ).toContain('actor.userId');
  });
  it('rejects a public hash, a non-unique identifier and session CRUD', () => {
    const input = planInput();
    input.entities[0]!.fields[1] = field('secretDigest');
    expect(implementationPlanContentSchema.safeParse(input).success).toBe(false);
    input.entities[0]!.fields[1] = field('secretDigest', 'STRING', { internal: true });
    input.entities[0]!.fields[0] = field('handle');
    expect(implementationPlanContentSchema.safeParse(input).success).toBe(false);
    input.entities[0]!.fields[0] = field('handle', 'STRING', { unique: true });
    input.entities[2]!.operations = ['GET'];
    expect(implementationPlanContentSchema.safeParse(input).success).toBe(false);
  });
});

const scopedPlanInput = () => {
  const base = planInput();
  return {
    ...base,
    authentication: {
      ...base.authentication,
      local: {
        ...base.authentication.local,
        scope: {
          entityLocalId: 'department',
          accountRelation: 'departments',
          labelField: 'name',
          statusField: 'state',
          activeStatus: 'ENABLED',
          displayNameField: 'handle',
          unrestrictedRoles: ['EDITOR'],
          permissionRelation: 'permissions',
          permissionOperationField: 'operation',
        },
      },
    },
    entities: [
      ...base.entities.map((entity) =>
        entity.localId === 'member'
          ? {
              ...entity,
              relations: [
                ...(entity.relations ?? []),
                { name: 'departments', kind: 'MANY_TO_MANY', targetEntityLocalId: 'department' },
              ],
            }
          : entity.localId === 'group'
            ? {
                ...entity,
                relations: [
                  { name: 'permissions', kind: 'MANY_TO_MANY', targetEntityLocalId: 'permission' },
                ],
              }
            : entity,
      ),
      {
        localId: 'permission',
        name: 'Permission',
        moduleLocalId: 'identity',
        fields: [field('operation', 'STRING', { unique: true })],
        operations: ['LIST'],
        readRoles: ['EDITOR'],
      },
      {
        localId: 'department',
        name: 'Department',
        moduleLocalId: 'identity',
        fields: [field('name'), field('state')],
        operations: ['LIST', 'GET'],
        readRoles: ['EDITOR', 'READER'],
        operationScope: { paths: [[]], includeUnscoped: false },
      },
      {
        localId: 'document',
        name: 'Document',
        moduleLocalId: 'identity',
        fields: [field('title')],
        relations: [
          {
            name: 'department',
            kind: 'MANY_TO_ONE',
            targetEntityLocalId: 'department',
            required: true,
          },
        ],
        operations: ['LIST', 'GET', 'CREATE'],
        operationScope: { paths: [['department']], includeUnscoped: false },
      },
    ],
    customEndpoints: [
      ...base.customEndpoints,
      {
        moduleLocalId: 'identity',
        method: 'GET',
        path: '/auth/context',
        summary: 'Consultar contexto',
        builtin: 'AUTH_CONTEXT',
      },
      {
        moduleLocalId: 'identity',
        method: 'POST',
        path: '/auth/context',
        summary: 'Seleccionar ámbito',
        builtin: 'SELECT_SCOPE',
      },
    ],
    routes: base.routes.map((route) =>
      route.path === '/home'
        ? {
            ...route,
            actions: [
              ...route.actions,
              { label: 'Consultar contexto', endpoint: 'GET /auth/context' },
              { label: 'Seleccionar ámbito', endpoint: 'POST /auth/context' },
            ],
          }
        : route,
    ),
  };
};

describe('operation scope generation', () => {
  it('allows shared-shell context loading without exempting orphan business actions', () => {
    const input = scopedPlanInput();
    input.routes = input.routes.map((route) => ({
      ...route,
      actions: route.actions.filter(
        (action) => !('endpoint' in action) || action.endpoint !== 'GET /auth/context',
      ),
    }));
    const upstream = upstreamFromSources([
      {
        code: 'UI-001',
        type: 'UI_BLUEPRINT',
        content: {
          screens: input.routes.map((route) => ({
            localId: route.screenLocalId,
            name: route.screenName,
            purpose: 'Operar',
            primaryActions: route.actions.map((action) => action.label),
          })),
        },
      },
    ]);
    const plan = {
      ...input,
      customEndpoints: [
        ...input.customEndpoints,
        {
          moduleLocalId: 'identity',
          method: 'GET',
          path: '/reports/documents',
          summary: 'Documentos',
          dataAccess: [{ entityLocalId: 'document', operations: ['READ'] }],
        },
      ],
    };
    const messages = coherenceGaps('IMPLEMENTATION_PLAN', plan, upstream).map((gap) => gap.message);
    expect(messages).not.toContain(
      'El endpoint GET /auth/context no atiende ninguna acción de pantalla.',
    );
    expect(messages).toContain(
      'El endpoint GET /reports/documents no atiende ninguna acción de pantalla.',
    );
  });
  it('validates generic ownership paths and rejects omissions', () => {
    const input = scopedPlanInput();
    expect(implementationPlanContentSchema.safeParse(input).success).toBe(true);
    expect(
      implementationPlanContentSchema.safeParse({
        ...input,
        authentication: {
          ...input.authentication,
          local: {
            ...input.authentication.local,
            scope: {
              ...input.authentication.local.scope,
              displayFields: [{ field: 'missing', label: 'Dato' }],
            },
          },
        },
      }).success,
    ).toBe(false);
    const invalid = {
      ...input,
      entities: input.entities.map((entity) =>
        entity.localId === 'document'
          ? { ...entity, operationScope: { paths: [['missing']], includeUnscoped: false } }
          : entity,
      ),
    };
    expect(implementationPlanContentSchema.safeParse(invalid).success).toBe(false);
    expect(
      implementationPlanContentSchema.safeParse({
        ...input,
        entities: input.entities.map((entity) =>
          entity.localId === 'document' ? { ...entity, operationScope: undefined } : entity,
        ),
      }).success,
    ).toBe(false);
  });
  it('requires explicit data capabilities for business actions and protects comparison scopes', () => {
    const input = scopedPlanInput();
    const action = {
      moduleLocalId: 'identity',
      method: 'GET',
      path: '/reports/documents',
      summary: 'Consultar documentos',
      roles: ['READER'],
    };
    expect(
      implementationPlanContentSchema.safeParse({
        ...input,
        customEndpoints: [...input.customEndpoints, action],
      }).success,
    ).toBe(false);
    const allowed = {
      ...action,
      dataAccess: [{ entityLocalId: 'document', operations: ['READ'] }],
    };
    expect(
      implementationPlanContentSchema.safeParse({
        ...input,
        customEndpoints: [...input.customEndpoints, allowed],
      }).success,
    ).toBe(true);
    expect(
      implementationPlanContentSchema.safeParse({
        ...input,
        customEndpoints: [...input.customEndpoints, { ...allowed, scopeAccess: 'ASSIGNED_SET' }],
      }).success,
    ).toBe(false);
  });
  it('allows scoped read-only POST previews as bindings but rejects writable preview sources', () => {
    const input = scopedPlanInput();
    const object = (name: string) => ({
      type: 'OBJECT',
      properties: [{ name, value: { type: 'INT' } }],
    });
    const parse = (operations: string[]) =>
      implementationPlanContentSchema.safeParse({
        ...input,
        customEndpoints: [
          ...input.customEndpoints,
          {
            moduleLocalId: 'identity',
            method: 'POST',
            path: '/documents/preview',
            summary: 'Revisar',
            roles: ['READER'],
            dataAccess: [{ entityLocalId: 'document', operations }],
            contract: { body: object('value'), response: object('value') },
          },
          {
            moduleLocalId: 'identity',
            method: 'POST',
            path: '/documents/confirm',
            summary: 'Confirmar',
            roles: ['READER'],
            dataAccess: [{ entityLocalId: 'document', operations: ['CREATE'] }],
            contract: {
              body: object('value'),
              response: object('value'),
              bindings: [
                {
                  kind: 'ACTION',
                  field: 'value',
                  sourceEndpoint: 'POST /documents/preview',
                  sourceField: 'value',
                },
              ],
            },
          },
        ],
        routes: [
          ...input.routes,
          {
            path: '/documents/review',
            screenName: 'Revisar documento',
            kind: 'CUSTOM',
            moduleLocalId: 'identity',
            roles: ['READER'],
            actions: [
              { label: 'Revisar', endpoint: 'POST /documents/preview' },
              { label: 'Confirmar', endpoint: 'POST /documents/confirm' },
            ],
          },
        ],
      }).success;
    expect(parse(['READ'])).toBe(true);
    expect(parse(['READ', 'UPDATE'])).toBe(false);
    expect(parse([])).toBe(false);
  });
  it('emits live context contracts, request isolation and functional scope controls', () => {
    const plan = implementationPlanContentSchema.parse(scopedPlanInput());
    const files = generateProject({
      plan,
      template: CASEFLOW_WEB_TS_V2,
      projectName: 'Biblioteca',
      slug: 'library',
    });
    const get = (path: string) => files.find((file) => file.path === path)!.content;
    expect(get('packages/api-client/src/index.ts')).toContain('Array<{');
    expect(get('apps/api/src/prisma/prisma.service.ts')).toContain('scopedTransaction');
    expect(get('apps/api/src/auth/operation-scope.ts')).toContain('AsyncLocalStorage');
    expect(get('apps/web/components/operation-context.tsx')).toContain('api.postAuthContext');
    expect(get('apps/web/lib/api.ts')).toContain('x-operation-scope');
    expect(get('apps/web/app/home/page.tsx')).toContain('data-action={"Seleccionar ámbito"}');
    const service = get('apps/api/src/auth/local-auth.service.ts');
    expect(service).toContain('session.member.groups.flatMap');
    expect(service).toContain('session.member.departments.filter');
  });
  it('unites repeated data capabilities without losing reads or adding undeclared writes', () => {
    const input = scopedPlanInput();
    const plan = implementationPlanContentSchema.parse({
      ...input,
      customEndpoints: [
        ...input.customEndpoints,
        {
          moduleLocalId: 'identity',
          method: 'POST',
          path: '/documents/record',
          summary: 'Registrar documento',
          roles: ['READER'],
          dataAccess: [
            { entityLocalId: 'document', operations: ['READ'] },
            { entityLocalId: 'document', operations: ['CREATE', 'READ'] },
          ],
        },
      ],
    });
    const files = generateProject({
      plan,
      template: CASEFLOW_WEB_TS_V2,
      projectName: 'Biblioteca',
      slug: 'library',
    });
    const controller = files.find(
      (file) =>
        file.path.endsWith('-actions.controller.ts') &&
        file.content.includes('postDocumentsRecord'),
    )!.content;
    expect(controller).toContain('@DataAccess({"Document":["READ","CREATE"]})');
    expect(controller).not.toContain('"Document":["READ","CREATE","UPDATE"]');
  });
});
