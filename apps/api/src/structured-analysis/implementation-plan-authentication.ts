import type { ImplementationSkeleton } from '@caseflow-ai/contracts';
import type {
  IpEndpoint,
  IpEntity,
  IpRoute,
  RoutesAccumulated,
} from './implementation-plan-batches';

// ADR-026: a plan that requires sign-in gets its local authentication from the
// server, not from the model: the account entity of the design is completed
// (unique login, internal password hash, status, roles as a relation) and the
// session, role and built-in operations the template expects are added.
type Field = IpEntity['fields'][number];
type Local = NonNullable<ImplementationSkeleton['authentication']['local']>;

const SECRET = /password|contrase|clave/i;
const ACCOUNT = /account|user|cuenta|usuario|staff|employee|member|personal/i;
const LOGIN = /^(login|username|user|email|mail|correo|usuario|handle)$/i;
const STATUS = /^(status|state|estado)$/i;
const ROLE = /^(roles?|rol|perfil|profile)$/i;

export const AUTH_ENDPOINTS = {
  LOGIN: 'POST /auth/login',
  LOGOUT: 'POST /auth/logout',
  AUTHORIZED_OPTIONS: 'GET /auth/options',
} as const;
type Builtin = keyof typeof AUTH_ENDPOINTS;
const SUMMARIES: Record<Builtin, string> = {
  LOGIN: 'Iniciar sesión con el identificador y la contraseña de la cuenta.',
  LOGOUT: 'Cerrar la sesión actual.',
  AUTHORIZED_OPTIONS: 'Consultar las opciones que autorizan los roles de la cuenta.',
};
// What a screen action asks of authentication, by its label.
const LABELS: [RegExp, Builtin][] = [
  [/iniciar sesi[oó]n|ingresar al sistema|acceder al sistema|\blog ?in\b|\bsign ?in\b/i, 'LOGIN'],
  [/cerrar sesi[oó]n|salir del sistema|\blog ?out\b|\bsign ?out\b/i, 'LOGOUT'],
  [/opciones (del|de su|de mi|seg[uú]n( el| su)?) rol|opciones autorizadas/i, 'AUTHORIZED_OPTIONS'],
];

const free = (base: string, taken: Set<string>) => {
  let value = base;
  for (let n = 2; taken.has(value); n += 1) value = `${base}${n}`;
  taken.add(value);
  return value;
};

export function completeLocalAuthentication(
  skeleton: ImplementationSkeleton,
  entities: IpEntity[],
): { skeleton: ImplementationSkeleton; entities: IpEntity[]; endpoints: IpEndpoint[] } {
  // A configuration the model wrote that names fields the entities do not
  // have binds nothing: it is completed again from the entities.
  const written = skeleton.authentication.local;
  const user = written && entities.find((entity) => entity.localId === written.userEntityLocalId);
  const writtenSession =
    written && entities.find((entity) => entity.localId === written.sessionEntityLocalId);
  const has = (entity: IpEntity | undefined, ...names: (string | undefined)[]) =>
    Boolean(entity) &&
    names.every((name) => !name || entity!.fields.some((field) => field.name === name));
  const bound =
    written &&
    has(user, written.loginField, written.passwordHashField, written.statusField) &&
    has(
      writtenSession,
      written.startedAtField,
      written.lastActivityAtField,
      written.invalidatedAtField,
      written.sessionStatusField,
    );
  if (written && !bound) {
    const { local: _unbound, ...rest } = skeleton.authentication;
    void _unbound;
    skeleton = { ...skeleton, authentication: rest };
  }
  const auth = skeleton.authentication;
  const account =
    entities.find((entity) => entity.fields.some((field) => SECRET.test(field.name))) ??
    entities.find((entity) => ACCOUNT.test(entity.name));
  // Without an account in the design there is nothing to bind: the readiness
  // check reports it before construction.
  if (!auth.required || auth.local || !account) return { skeleton, entities, endpoints: [] };

  const ids = new Set(entities.map((entity) => entity.localId));
  const names = new Set(entities.map((entity) => entity.name));
  const module = account.moduleLocalId;
  const fieldNames = new Set<string>();
  // Argon2id keeps its salt in the hash; a role field becomes the relation.
  const kept = account.fields.filter(
    (field) => !/salt/i.test(field.name) && !ROLE.test(field.name),
  );
  kept.forEach((field) => fieldNames.add(field.name));
  const add = (field: Field) => (kept.push(field), field.name);
  const blank = { enumValues: [], unique: false, required: true };

  const login =
    kept.find((field) => field.type === 'STRING' && LOGIN.test(field.name)) ??
    kept.find((field) => field.type === 'STRING' && field.unique && !field.internal);
  const loginField = login
    ? login.name
    : add({ ...blank, name: free('login', fieldNames), type: 'STRING', unique: true });
  const secret = kept.find((field) => SECRET.test(field.name));
  const passwordHashField = secret
    ? secret.name === 'password'
      ? free('passwordHash', fieldNames)
      : secret.name
    : add({ ...blank, name: free('passwordHash', fieldNames), type: 'STRING', internal: true });
  const status = kept.find(
    (field) => STATUS.test(field.name) && ['STRING', 'ENUM'].includes(field.type),
  );
  const values = status?.type === 'ENUM' ? status.enumValues : [];
  const activeStatus = values.find((v) => /activ|enabled|habil/i.test(v) && !/inactiv/i.test(v));
  const inactiveStatus = values.find((v) => /inactiv|disabled|deshabil|baja|suspend/i.test(v));
  const statusField = status
    ? status.name
    : add({
        ...blank,
        name: free('status', fieldNames),
        type: 'STRING',
        readOnly: true,
        serverDefault: 'ACTIVE',
      });
  const fields = kept.map((field): Field => {
    if (field.name === loginField) return { ...field, required: true, unique: true };
    if (field === secret) {
      const { readOnly: _readOnly, serverDefault: _default, ...rest } = field;
      void _readOnly;
      void _default;
      return { ...rest, name: passwordHashField, type: 'STRING', internal: true, required: true };
    }
    return field;
  });

  const relationNames = new Set(account.relations.map((relation) => relation.name));
  const existingRole = entities.find(
    (entity) =>
      /^(role|rol)$/i.test(entity.name) &&
      entity.fields.some((field) => field.type === 'STRING' && field.unique && field.required),
  );
  const role: IpEntity = existingRole ?? {
    localId: free('role', ids),
    name: free('Role', names),
    moduleLocalId: module,
    fields: [{ ...blank, name: 'name', type: 'STRING', unique: true }],
    relations: [],
    operations: ['LIST'],
    readRoles: account.writeRoles,
    writeRoles: [],
  };
  const roleNameField = role.fields.find(
    (field) => field.type === 'STRING' && field.unique && field.required,
  )!.name;
  const roleRelation = free('roles', relationNames);
  const session: IpEntity = {
    localId: free('session', ids),
    name: free('Session', names),
    moduleLocalId: module,
    fields: [
      { ...blank, name: 'startedAt', type: 'DATETIME' },
      { ...blank, name: 'lastActivityAt', type: 'DATETIME' },
      { ...blank, name: 'invalidatedAt', type: 'DATETIME', required: false },
      { ...blank, name: 'status', type: 'STRING' },
    ],
    relations: [
      {
        name: 'account',
        kind: 'MANY_TO_ONE',
        targetEntityLocalId: account.localId,
        required: true,
      },
    ],
    operations: [],
    readRoles: [],
    writeRoles: [],
  };
  const local: Local = {
    userEntityLocalId: account.localId,
    loginField,
    passwordHashField,
    statusField,
    activeStatus: status ? (activeStatus ?? values[0] ?? 'ACTIVE') : 'ACTIVE',
    ...(status ? (inactiveStatus ? { inactiveStatus } : {}) : { inactiveStatus: 'INACTIVE' }),
    roleRelation,
    roleNameField,
    sessionEntityLocalId: session.localId,
    sessionUserRelation: 'account',
    startedAtField: 'startedAt',
    lastActivityAtField: 'lastActivityAt',
    invalidatedAtField: 'invalidatedAt',
    sessionStatusField: 'status',
    activeSessionStatus: 'ACTIVE',
    closedSessionStatus: 'CLOSED',
  };
  return {
    skeleton: { ...skeleton, authentication: { ...auth, local } },
    entities: [
      ...entities.map((entity) =>
        entity === account
          ? {
              ...entity,
              fields,
              relations: [
                ...entity.relations,
                {
                  name: roleRelation,
                  kind: 'MANY_TO_MANY' as const,
                  targetEntityLocalId: role.localId,
                  required: false,
                },
              ],
            }
          : entity,
      ),
      ...(existingRole ? [] : [role]),
      session,
    ],
    endpoints: (Object.keys(AUTH_ENDPOINTS) as Builtin[]).map((builtin) => {
      const [method, path] = AUTH_ENDPOINTS[builtin].split(' ') as [IpEndpoint['method'], string];
      return {
        moduleLocalId: module,
        method,
        path,
        summary: SUMMARIES[builtin],
        builtin,
        roles: [],
      };
    }),
  };
}

// The actions that sign in, sign out or list the role's options use the
// built-in operations, whatever the model chose for them. One the screens do
// not offer is added where it belongs: sign-in on the access page, the options
// on the home page and sign-out on a page of its own, so the three stay apart.
export function bindAuthenticationActions(accumulated: RoutesAccumulated): RoutesAccumulated {
  const builtins = new Set(
    accumulated.customEndpoints.flatMap((endpoint) => (endpoint.builtin ? [endpoint.builtin] : [])),
  );
  if (!builtins.has('LOGIN')) return accumulated;
  const pageOf = new Map<Builtin, string>();
  let routes = accumulated.routes.map((route) => ({
    ...route,
    actions: route.actions.flatMap((action): IpRoute['actions'] => {
      const builtin = LABELS.find(([pattern]) => pattern.test(action.label))?.[1];
      if (!builtin) return [action];
      const taken = pageOf.get(builtin);
      if (taken && taken !== route.path) return [];
      pageOf.set(builtin, route.path);
      return [{ label: action.label, endpoint: AUTH_ENDPOINTS[builtin] }];
    }),
  }));
  const used = new Set(pageOf.values());
  const place = (builtin: Builtin, label: string, pattern: RegExp) => {
    if (pageOf.has(builtin)) return;
    const route = routes.find((item) => pattern.test(item.path) && !used.has(item.path));
    if (!route) return;
    used.add(route.path);
    pageOf.set(builtin, route.path);
    routes = routes.map((item) =>
      item === route
        ? { ...item, actions: [...item.actions, { label, endpoint: AUTH_ENDPOINTS[builtin] }] }
        : item,
    );
  };
  place('LOGIN', 'Iniciar sesión', /^\/(login|signin|sign-in|acceso|ingreso)$/);
  place('AUTHORIZED_OPTIONS', 'Consultar opciones', /^\/(home|inicio|dashboard)?$/);
  if (!pageOf.has('LOGOUT')) {
    const paths = new Set(routes.map((route) => route.path));
    const account = accumulated.customEndpoints.find((endpoint) => endpoint.builtin === 'LOGOUT')!;
    const path = ['/logout', '/signout', '/sign-out'].find((item) => !paths.has(item));
    if (path)
      routes.push({
        path,
        screenName: 'Cerrar sesión',
        moduleLocalId: account.moduleLocalId,
        kind: 'CUSTOM',
        actions: [{ label: 'Cerrar sesión', endpoint: AUTH_ENDPOINTS.LOGOUT }],
      });
  }
  // The access page signs in; it does not show or edit the account records.
  routes = routes.map((route) =>
    route.path === pageOf.get('LOGIN') && !route.actions.some((action) => action.operation)
      ? { ...route, entityLocalId: undefined }
      : route,
  );
  return { ...accumulated, routes };
}
