import type { GenerationContext, GeneratedProjectFile } from './types';
import { file, SCOPE } from './types';
import { lowerFirst, kebabCase } from '../naming';
import { actionMarker, pagePath, toWebRoot } from './frontend.templates';
import { sampleInput } from './contracts.templates';
import {
  OPERATION_SCOPE_RUNTIME,
  roleOperations,
  scopeMetadata,
} from './operation-scope.templates';
import { collectionPath } from '../naming';
import { operationContextFiles } from './operation-context.templates';

export function localAuthFiles(ctx: GenerationContext): GeneratedProjectFile[] {
  const { plan } = ctx;
  const local = plan.authentication.local;
  if (!local) return [];
  const account = plan.entities.find((e) => e.localId === local.userEntityLocalId)!;
  const session = plan.entities.find((e) => e.localId === local.sessionEntityLocalId)!;
  const scope = local.scope;
  const scopeEntity = plan.entities.find((entity) => entity.localId === scope?.entityLocalId);
  const roleEntity = plan.entities.find(
    (entity) =>
      entity.localId ===
      account.relations.find((relation) => relation.name === local.roleRelation)
        ?.targetEntityLocalId,
  )!;
  const permissionEntity = plan.entities.find(
    (entity) =>
      entity.localId ===
      roleEntity.relations.find((relation) => relation.name === scope?.permissionRelation)
        ?.targetEntityLocalId,
  );
  const roleInclude = scope ? `{ include: { ${scope.permissionRelation}: true } }` : 'true';
  const user = lowerFirst(account.name),
    sessions = lowerFirst(session.name);
  const loginRoute = plan.routes.find((r) =>
    r.actions.some((a) => a.endpoint === 'POST /auth/login'),
  );
  const homeRoute = plan.routes.find((r) =>
    r.actions.some((a) => a.endpoint === 'GET /auth/options'),
  );
  const elements = [
    `entity:${account.localId}`,
    `entity:${session.localId}`,
    'endpoint:POST /auth/login',
    'endpoint:POST /auth/logout',
    'endpoint:GET /auth/options',
  ];
  const files = [
    file(
      'apps/web/lib/api.spec.ts',
      `import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, accessToken } from './api';
afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });
describe('session response ordering', () => {
 it('does not revoke a new session when a previous request returns unauthorized late', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  accessToken.set('previous-session');
  const pending = api.getAuthOptions();
  accessToken.set('new-session');
  finish(new Response(JSON.stringify({ message: 'Sesión anterior expirada.' }), { status: 401, headers: { 'content-type': 'application/json' } }));
  await expect(pending).rejects.toThrow();
  expect(accessToken.get()).toBe('new-session');
  expect(window.sessionStorage.getItem('session-expired')).toBeNull();
 });
 it('keeps an existing session when a new login attempt has incorrect credentials', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Credenciales no válidas.' }), { status: 401, headers: { 'content-type': 'application/json' } })));
  accessToken.set('existing-session');
  await expect(api.postAuthLogin({ identifier: 'test', password: 'incorrect' })).rejects.toThrow();
  expect(accessToken.get()).toBe('existing-session');
 });
});
`,
      { kind: 'TEST', origin: 'DETERMINISTIC', planElements: elements },
    ),
    file(
      'apps/web/components/app-nav.tsx',
      `'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, accessToken } from '../lib/api';
${scope ? "import { OperationContextPanel } from './operation-context';" : ''}
export function AppNav() {
 const pathname = usePathname();
 const [ready, setReady] = useState(false);
 const [filter, setFilter] = useState('');
 useEffect(() => setReady(true), []);
 const query = useQuery({ queryKey: ['authorized-options'], queryFn: () => api.getAuthOptions(), enabled: ready && Boolean(accessToken.get()) });
 if (!ready) return <nav aria-label="Navegación principal"><p role="status">Cargando navegación…</p></nav>;
 if (!accessToken.get()) return <nav aria-label="Navegación principal"><Link href={${JSON.stringify(loginRoute?.path ?? '/access')}}>Iniciar sesión</Link></nav>;
 if (query.isPending) return <p role="status">Consultando opciones…</p>;
 if (query.isError) return <p role="alert">No se pudieron consultar las opciones autorizadas.</p>;
 return <nav aria-label="Navegación principal" className="flex flex-col gap-1">${scope ? '<OperationContextPanel compact />' : ''}{(query.data ?? []).length > 8 ? <input type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Buscar opción…" aria-label="Buscar opción del menú" className="mb-2 w-full rounded-md border bg-background px-3 py-2 text-sm" /> : null}{(query.data ?? []).filter(item => item.label.toLocaleLowerCase('es').includes(filter.trim().toLocaleLowerCase('es'))).map(item => <Link key={item.path} href={item.path} aria-current={pathname === item.path ? 'page' : undefined} className="rounded-md px-3 py-2 text-sm hover:bg-muted aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">{item.label}</Link>)}<Link href={${JSON.stringify(plan.routes.find((r) => r.actions.some((a) => a.endpoint === 'POST /auth/logout'))?.path ?? '/access')}} className="rounded-md px-3 py-2 text-sm hover:bg-muted">Cerrar sesión</Link></nav>;
}
`,
      { origin: 'DETERMINISTIC', planElements: elements },
    ),
    file(
      'apps/web/components/app-nav.spec.tsx',
      `import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppNav } from './app-nav';
vi.mock('next/navigation', () => ({ usePathname: () => '/allowed' }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [{ path: '/allowed', label: 'Opción autorizada' }], isPending: false, isError: false }) }));
vi.mock('../lib/api', () => ({ api: { getAuthOptions: vi.fn() }, accessToken: { get: () => 'test-token' } }));
${scope ? "vi.mock('./operation-context', () => ({ OperationContextPanel: () => null }));" : ''}
describe('AppNav', () => { it('shows only server-authorized options and marks the current one', () => {
 render(<AppNav />); expect(screen.getByRole('link', { name: 'Opción autorizada' }).getAttribute('aria-current')).toBe('page'); expect(screen.queryByText('Opción prohibida')).toBeNull();
}); });
`,
      { kind: 'TEST', origin: 'DETERMINISTIC', planElements: elements },
    ),
    file(
      'apps/api/src/auth/auth.guard.ts',
      `import { Injectable, ForbiddenException, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LocalAuthService, type SessionActor } from './local-auth.service';
import { PUBLIC_KEY, ROLES_KEY${scope ? ', OPERATION_KEY, DATA_ACCESS_KEY, SCOPE_ACCESS_KEY, SCOPE_OPTIONAL_KEY' : ''} } from './roles.decorator';
@Injectable()
export class AuthGuard implements CanActivate {
 constructor(private readonly reflector: Reflector, private readonly auth: LocalAuthService) {}
 async canActivate(context: ExecutionContext): Promise<boolean> {
  const targets = [context.getHandler(), context.getClass()];
  if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
  const req = context.switchToHttp().getRequest<{ headers: { authorization?: string; 'x-operation-scope'?: string }; user?: SessionActor }>();
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Inicie sesión para continuar.');
  const actor = await this.auth.authenticate(header.slice(7)${scope ? ", req.headers['x-operation-scope'], Boolean(this.reflector.getAllAndOverride<boolean>(SCOPE_OPTIONAL_KEY, targets))" : ''});
  const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets) ?? [];
  if (roles.length && !roles.some(role => actor.roles.includes(role))) throw new ForbiddenException('No tiene permiso para realizar esta acción.');
  ${
    scope
      ? `const operation = this.reflector.getAllAndOverride<string>(OPERATION_KEY, targets);
  if (operation && !['POST /auth/logout','GET /auth/context','POST /auth/context','GET /auth/options'].includes(operation) && !actor.permissions.includes(operation)) throw new ForbiddenException('No tiene permiso para realizar esta operación.');
  const scopeAccess = this.reflector.getAllAndOverride<'ASSIGNED_SET'>(SCOPE_ACCESS_KEY, targets);
  if (scopeAccess && !actor.roles.some(role => ${JSON.stringify(scope.unrestrictedRoles)}.includes(role))) throw new ForbiddenException('No tiene permiso para consultar varios ámbitos.');
  actor.scopeAccess = scopeAccess ?? 'SELECTED'; actor.currentOperation = operation;
  const capabilities = this.reflector.getAllAndOverride<Record<string,string[]>>(DATA_ACCESS_KEY, targets);
  if (capabilities !== undefined && actor.scopeAccess !== 'ASSIGNED_SET' && !actor.selectedScopeId) throw new ForbiddenException('Seleccione un ámbito autorizado para continuar.');
  if (capabilities !== undefined) actor.dataAccess = Object.fromEntries(Object.entries(capabilities).map(([model, operations]) => [model, Object.freeze([...operations]) as unknown as string[]]));
  if (actor.dataAccess) Object.freeze(actor.dataAccess);
  Object.freeze(actor.roles); Object.freeze(actor.permissions); Object.freeze(actor.scopeIds); Object.freeze(actor);`
      : ''
  }
  req.user = actor; return true;
 }
}
`,
      { origin: 'DETERMINISTIC', planElements: elements },
    ),
    file(
      'apps/api/src/auth/auth.spec.ts',
      `import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { LocalAuthService } from './local-auth.service';
import { signToken, verifyToken } from './jwt';
import { PUBLIC_KEY, ROLES_KEY } from './roles.decorator';
const context = (metadata: Record<string, unknown>, authorization?: string) => {
 const handler = () => undefined; for (const [key, value] of Object.entries(metadata)) Reflect.defineMetadata(key, value, handler);
 return { getHandler: () => handler, getClass: () => class {}, switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) } as unknown as ExecutionContext;
};
describe('local session authentication', () => {
 it('validates live sessions, attaches current roles and enforces public and restricted routes', async () => {
  const auth = { authenticate: vi.fn().mockResolvedValue({ userId: 'u', sessionId: 's', roles: ['ADMIN'] }) };
  const guard = new AuthGuard(new Reflector(), auth as unknown as LocalAuthService);
  await expect(guard.canActivate(context({ [PUBLIC_KEY]: true }))).resolves.toBe(true);
  await expect(guard.canActivate(context({}))).rejects.toThrow();
  await expect(guard.canActivate(context({ [ROLES_KEY]: ['ADMIN'] }, 'Bearer token'))).resolves.toBe(true);
  await expect(guard.canActivate(context({ [ROLES_KEY]: ['OTHER'] }, 'Bearer token'))).rejects.toThrow();
  auth.authenticate.mockRejectedValue(new Error('Session revoked'));
  await expect(guard.canActivate(context({}, 'Bearer token'))).rejects.toThrow('Session revoked');
 });
 it('rejects expired, tampered and wrong-key tokens', () => {
  const token = signToken({ sub: 'u', sessionId: 's', roles: [], exp: Math.floor(Date.now() / 1000) + 60 }, 'test-only');
  expect(verifyToken(token, 'test-only')?.sessionId).toBe('s');
  expect(verifyToken(token + 'x', 'test-only')).toBeNull();
  expect(verifyToken(token, 'other')).toBeNull();
  expect(verifyToken(token, 'test-only', Date.now() + 120000)).toBeNull();
 });
});
`,
      { kind: 'TEST', origin: 'DETERMINISTIC', planElements: elements },
    ),
    file(
      'apps/api/src/auth/safe-response.interceptor.ts',
      `import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';
const INTERNAL = new Set(${JSON.stringify([...new Set(['password', ...plan.entities.flatMap((e) => e.fields.filter((f) => f.internal).map((f) => f.name))])])});
export function publicResponse(value: unknown): unknown {
 if (Array.isArray(value)) return value.map(publicResponse);
 if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
 return Object.fromEntries(Object.entries(value).filter(([key]) => !INTERNAL.has(key)).map(([key, item]) => [key, publicResponse(item)]));
}
@Injectable()
export class SafeResponseInterceptor implements NestInterceptor {
 intercept(_context: ExecutionContext, next: CallHandler) { return next.handle().pipe(map(publicResponse)); }
}
`,
      { origin: 'DETERMINISTIC', planElements: elements },
    ),
    file(
      'apps/api/src/auth/local-auth.service.ts',
      `import { Injectable, UnauthorizedException, HttpException${scope ? ', ForbiddenException' : ''} } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { signToken, verifyToken } from './jwt';

export interface SessionActor { userId: string; sessionId: string; roles: string[]; ${scope ? "displayName: string; userStatus: string; permissions: string[]; scopeIds: string[]; scopes: { id: string; label: string; status: string; details: {label: string; value: string}[] }[]; selectedScopeId?: string; scopeAccess?: 'SELECTED' | 'ASSIGNED_SET'; currentOperation?:string; dataAccess?:Record<string,string[]>;" : ''} }
const seconds = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 86400) throw new Error('Invalid authentication configuration.');
  return value;
};
@Injectable()
export class LocalAuthService {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  constructor(private readonly prisma: PrismaService) {}
  private attempt(identifier: string, address: string) {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until < now) this.attempts.delete(key);
    if (this.attempts.size >= 10000) throw new HttpException('Intente de nuevo más tarde.', 429);
    const key = 'account:' + createHash('sha256').update(identifier.normalize('NFKC').toLowerCase()).digest('hex');
    const addressKey = 'address:' + createHash('sha256').update(address).digest('hex');
    for (const [current, maximum] of [[key, seconds('AUTH_LOGIN_MAX_ATTEMPTS', 5)], [addressKey, seconds('AUTH_LOGIN_IP_MAX_ATTEMPTS', 50)]] as const) {
      const entry = this.attempts.get(current) ?? { count: 0, until: now + seconds('AUTH_LOGIN_WINDOW_SECONDS', 900) * 1000 };
      if (entry.count >= maximum) throw new HttpException('Demasiados intentos. Intente de nuevo más tarde.', 429);
      entry.count++; this.attempts.set(current, entry);
    }
    return key;
  }
  private async recordAccess(userId: string | null, result: string, database: ${local.audit ? `Pick<PrismaService, '${lowerFirst(plan.entities.find((e) => e.localId === local.audit!.entityLocalId)!.name)}'>` : 'unknown'} = this.prisma) {
    ${local.audit ? `await database.${lowerFirst(plan.entities.find((e) => e.localId === local.audit!.entityLocalId)!.name)}.create({ data: { ${local.audit.userRelation}Id: userId, ${local.audit.occurredAtField}: new Date(), ${local.audit.resultField}: result, ${local.audit.correlationField}: randomUUID() } });` : 'void userId; void result; void randomUUID; void database;'}
  }
  recordRejectedLogin() { return this.recordAccess(null, 'FAILURE'); }
  async login(identifier: string, password: string, address: string) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('Missing authentication configuration.');
    let key: string;
    try { key = this.attempt(identifier, address); }
    catch (failure) { await this.recordAccess(null, 'THROTTLED'); throw failure; }
    const account = await this.prisma.${user}.findUnique({ where: { ${local.loginField}: identifier }, include: { ${local.roleRelation}: true } });
    let valid = false;
    if (account?.${local.statusField} === ${JSON.stringify(local.activeStatus)}) {
      try { valid = await argon2.verify(account.${local.passwordHashField}, password); } catch { valid = false; }
    } else {
      // Match the password-verification work for unknown or inactive accounts.
      await argon2.hash(password, { type: argon2.argon2id });
    }
    if (!valid || !account) { await this.recordAccess(account?.id ?? null, 'FAILURE'); throw new UnauthorizedException('Credenciales no válidas.'); }
    this.attempts.delete(key);
    const roles = account.${local.roleRelation}.map(role => role.${local.roleNameField});
    const now = new Date();
    const session = await this.prisma.$transaction(async database => {
      const created = await database.${sessions}.create({ data: { ${local.sessionUserRelation}Id: account.id, ${local.startedAtField}: now, ${local.lastActivityAtField}: now, ${local.sessionStatusField}: ${JSON.stringify(local.activeSessionStatus)} } });
      await this.recordAccess(account.id, 'SUCCESS', database);
      return created;
    });
    const exp = Math.floor(now.getTime() / 1000) + seconds('AUTH_TOKEN_SECONDS', 900);
    return { token: signToken({ sub: account.id, roles, exp, sessionId: session.id }, secret), userId: account.id, roles, expiresAt: new Date(exp * 1000).toISOString() };
  }
  async authenticate(token: string${scope ? ', requestedScope?: string, optionalScope = false' : ''}): Promise<SessionActor> {
    const secret = process.env.JWT_SECRET;
    const claims = secret ? verifyToken(token, secret) : null;
    if (!claims?.sessionId || !/^[a-f0-9-]{36}$/i.test(claims.sessionId)) throw new UnauthorizedException('Inicie sesión para continuar.');
    const session = await this.prisma.${sessions}.findUnique({ where: { id: claims.sessionId }, include: { ${local.sessionUserRelation}: { include: { ${local.roleRelation}: ${roleInclude}${scope ? `, ${scope.accountRelation}: true` : ''} } } } });
    const now = new Date();
    if (!session || session.${local.sessionUserRelation}Id !== claims.sub || session.${local.sessionStatusField} !== ${JSON.stringify(local.activeSessionStatus)} || session.${local.invalidatedAtField} || session.${local.sessionUserRelation}.${local.statusField} !== ${JSON.stringify(local.activeStatus)} || now.getTime() - session.${local.lastActivityAtField}.getTime() > seconds('AUTH_IDLE_SECONDS', 1800) * 1000)
      throw new UnauthorizedException('La sesión expiró. Inicie sesión de nuevo.');
    await this.prisma.${sessions}.update({ where: { id: session.id }, data: { ${local.lastActivityAtField}: now } });
    const roles = session.${local.sessionUserRelation}.${local.roleRelation}.map(role => role.${local.roleNameField});
    ${
      scope
        ? `const available = roles.some(role => ${JSON.stringify(scope.unrestrictedRoles)}.includes(role))
      ? await this.prisma.${lowerFirst(scopeEntity!.name)}.findMany({ where: { ${scope.statusField}: ${JSON.stringify(scope.activeStatus)} }, take: 1000 })
      : session.${local.sessionUserRelation}.${scope.accountRelation}.filter(item => item.${scope.statusField} === ${JSON.stringify(scope.activeStatus)});
    const scopes = available.map(item => ({ id: item.id, label: item.${scope.labelField}, status: item.${scope.statusField}, details: [${scope.displayFields.map((binding) => `{label: ${JSON.stringify(binding.label)}, value: item.${binding.field} ?? ''}`).join(',')}] }));
    const selectedScopeId = scopes.some(item => item.id === requestedScope) ? requestedScope : undefined;
    if (requestedScope && !selectedScopeId && !optionalScope) throw new ForbiddenException('El ámbito solicitado no está autorizado para esta cuenta.');
    const permissions = [...new Set(session.${local.sessionUserRelation}.${local.roleRelation}.flatMap(role => role.${scope.permissionRelation}.map(permission => permission.${scope.permissionOperationField})))];`
        : ''
    }
    return { userId: claims.sub, sessionId: session.id, roles${scope ? `, displayName: session.${local.sessionUserRelation}.${scope.displayNameField}, userStatus: session.${local.sessionUserRelation}.${local.statusField}, scopes, scopeIds: scopes.map(item => item.id), selectedScopeId, permissions` : ''} };
  }
  async deactivate(userId: string) {
    await this.prisma.$transaction(async database => {
      await database.${user}.update({ where: { id:userId }, data: { ${local.statusField}: ${JSON.stringify(local.inactiveStatus ?? 'INACTIVE')} } });
      await database.${sessions}.updateMany({ where: { ${local.sessionUserRelation}Id:userId }, data: { ${local.invalidatedAtField}: new Date(), ${local.sessionStatusField}: ${JSON.stringify(local.closedSessionStatus)} } });
    });
    return { deactivated:true };
  }
  async logout(actor: SessionActor) {
    await this.prisma.${sessions}.updateMany({ where: { id: actor.sessionId, ${local.sessionUserRelation}Id: actor.userId }, data: { ${local.invalidatedAtField}: new Date(), ${local.sessionStatusField}: ${JSON.stringify(local.closedSessionStatus)} } });
    return { closed: true };
  }
  options(actor: SessionActor) {
    const routes = ${JSON.stringify(plan.routes.filter((r) => !r.path.includes('[') && !r.actions.some((a) => ['POST /auth/login', 'POST /auth/logout'].includes(a.endpoint ?? ''))).map((r) => ({ path: r.path, label: r.screenName, roles: r.roles ?? [], ...(scope ? { operations: r.actions.flatMap((action) => (action.endpoint && !['GET /auth/options', 'GET /auth/context', 'POST /auth/context'].includes(action.endpoint) ? [action.endpoint] : action.operation && r.entityLocalId ? [{ LIST: 'GET', GET: 'GET', CREATE: 'POST', UPDATE: 'PATCH', DELETE: 'DELETE' }[action.operation] + ' ' + collectionPath(plan.entities.find((entity) => entity.localId === r.entityLocalId)!.name) + (['GET', 'UPDATE', 'DELETE'].includes(action.operation) ? '/:id' : '')] : [])) } : {}) })))};
    return routes.filter(route => (!route.roles.length || route.roles.some(role => actor.roles.includes(role)))${scope ? ' && (!route.operations.length || route.operations.some(operation => actor.permissions.includes(operation)))' : ''}).map(({ path, label }) => ({ path, label }));
  }
  ${
    scope
      ? `context(actor: SessionActor) { return { userId: actor.userId, displayName: actor.displayName, userStatus: actor.userStatus, roles: actor.roles, permissions: actor.permissions, scopes: actor.scopes, selectedScopeId: actor.selectedScopeId ?? null }; }
  selectScope(actor: SessionActor, scopeId: string) { if (!actor.scopeIds.includes(scopeId)) throw new ForbiddenException('El ámbito solicitado no está autorizado para esta cuenta.'); return { scopeId }; }`
      : ''
  }
}
`,
      { origin: 'DETERMINISTIC', planElements: elements },
    ),
    file(
      'apps/api/src/auth/local-auth.controller.ts',
      `import { Body, Controller, Get, Post, Req, HttpCode${plan.customEndpoints.some((endpoint) => endpoint.builtin === 'ACCOUNT_DEACTIVATE') ? ', Param' : ''} } from '@nestjs/common';
import { z } from 'zod';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import { Public${plan.customEndpoints.some((endpoint) => endpoint.builtin === 'ACCOUNT_DEACTIVATE') ? ', Roles' : ''}${scope ? ', ScopeOptional, Operation' : ''} } from './roles.decorator';
import { LocalAuthService, type SessionActor } from './local-auth.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
@Controller('auth')
export class LocalAuthController {
  constructor(private readonly auth: LocalAuthService) {}
  @Post('login') @HttpCode(200) @Public()
  @ApiOperation({ operationId: 'postAuthLogin' })
  @ApiBody({ schema: { type: 'object', required: ['identifier', 'password'], properties: { identifier: { type: 'string' }, password: { type: 'string', format: 'password', writeOnly: true } } } })
  // Malformed attempts are recorded too, before the validation error is returned.
  async login(@Body() raw: unknown, @Req() req: { ip?: string }) {
    let body: { identifier: string; password: string };
    try { body = new ZodValidationPipe(z.object({ identifier: z.string().trim().min(1).max(255), password: z.string().min(1).max(1024) }).strict()).transform(raw) as { identifier: string; password: string }; }
    catch (failure) { await this.auth.recordRejectedLogin(); throw failure; }
    return this.auth.login(body.identifier, body.password, req.ip ?? 'unknown');
  }
  @Post('logout') @HttpCode(200) @ApiOperation({ operationId: 'postAuthLogout' })
  ${scope ? "@ScopeOptional() @Operation('POST /auth/logout')" : ''}
  logout(@Req() req: { user: SessionActor }) { return this.auth.logout(req.user); }
  ${
    plan.customEndpoints.find((endpoint) => endpoint.builtin === 'ACCOUNT_DEACTIVATE')
      ? `@Post('accounts/:userId/deactivate') @HttpCode(200) @Roles(${plan.customEndpoints
          .find((endpoint) => endpoint.builtin === 'ACCOUNT_DEACTIVATE')!
          .roles.map((role) => JSON.stringify(role))
          .join(', ')})
  @ApiOperation({ operationId: 'postAuthAccountsDeactivate' })${scope ? "\n  @Operation('POST /auth/accounts/:userId/deactivate')" : ''}
  deactivate(@Param('userId', new ZodValidationPipe(z.uuid())) userId: string) { return this.auth.deactivate(userId); }`
      : ''
  }
  @Get('options') @ApiOperation({ operationId: 'getAuthOptions' })
  ${scope ? '@ScopeOptional()' : ''}
  options(@Req() req: { user: SessionActor }) { return this.auth.options(req.user); }
  ${
    scope
      ? `@Get('context') @ScopeOptional() @ApiOperation({ operationId: 'getAuthContext' })
  context(@Req() req: { user: SessionActor }) { return this.auth.context(req.user); }
  @Post('context') @ScopeOptional() @HttpCode(200) @ApiOperation({ operationId: 'postAuthContext' })
  selectScope(@Req() req: { user: SessionActor }, @Body(new ZodValidationPipe(z.object({ scopeId: z.uuid() }).strict())) body: { scopeId: string }) { return this.auth.selectScope(req.user, body.scopeId); }`
      : ''
  }
}
`,
      { origin: 'DETERMINISTIC', planElements: elements },
    ),
  ];
  const createInput = {
    ...sampleInput(account),
    [local.loginField]: 'capture-account',
    [local.statusField]: local.activeStatus,
  };
  delete createInput[local.passwordHashField];
  files.push(
    file(
      'apps/api/src/auth/create-account.ts',
      `import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { ${account.name}Service } from '../${kebabCase(plan.modules.find((m) => m.localId === account.moduleLocalId)!.name)}/${kebabCase(account.name)}.service';
import { create${account.name}Schema } from '${SCOPE}/contracts';
${scope ? "import { initializeAuthorization } from './initialize-authorization';" : ''}
try { process.loadEnvFile(resolve(__dirname, '../../../../.env')); } catch { /* Values may come from the environment. */ }
async function main() {
 const prisma = new PrismaService();
 try { const input = create${account.name}Schema.parse(JSON.parse(process.env.ACCOUNT_INPUT ?? '{}')); ${scope ? "await initializeAuthorization(prisma, process.env.RESET_ROLE_PERMISSIONS === 'true');" : ''} await new ${account.name}Service(prisma).create(input); console.log('Cuenta creada.'); }
 finally { await prisma.$disconnect(); }
}
void main().catch(() => { console.error('No se pudo crear la cuenta. Revise ACCOUNT_INPUT y la conexión.'); process.exitCode = 1; });
`,
      { origin: 'DETERMINISTIC', planElements: elements },
    ),
  );
  files.push(
    file(
      'apps/api/src/auth/capture-fixtures.ts',
      `import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ${account.name}Service } from '../${kebabCase(plan.modules.find((m) => m.localId === account.moduleLocalId)!.name)}/${kebabCase(account.name)}.service';
import { LocalAuthService } from './local-auth.service';
${scope ? "import { initializeAuthorization } from './initialize-authorization';\nimport { signToken, verifyToken } from './jwt';" : ''}
// Invoked only by the fixed controller command inside a disposable capture runtime.
async function main() {
 const prisma = new PrismaService(); const tokens: Record<string, string> = {};
 try {
  ${
    scope
      ? `await initializeAuthorization(prisma);
  const fixtureScope = await prisma.${lowerFirst(scopeEntity!.name)}.create({ data: { ...${JSON.stringify(sampleInput(scopeEntity!))}, ${scope.labelField}: 'Ámbito de prueba', ${scope.statusField}: ${JSON.stringify(scope.activeStatus)} } });`
      : ''
  }
  const roles = ${JSON.stringify(plan.authentication.roles)} as const;
  for (const [index, role] of roles.entries()) {
   const identifier = 'capture-' + index + '-' + randomUUID(); const password = randomUUID();
   await new ${account.name}Service(prisma).create({ ...${JSON.stringify(createInput)}, ${account.fields
     .filter((field) => field.unique && field.name !== local.loginField && field.type === 'STRING')
     .map((field) => `${field.name}: identifier + ${JSON.stringify('-' + field.name)},`)
     .join(
       ' ',
     )} ${local.loginField}: identifier, password, roleNames: [role]${scope ? `, ${scope.accountRelation}Ids: [fixtureScope.id]` : ''} });
   tokens[role] = (await new LocalAuthService(prisma).login(identifier, password, 'capture')).token;
   ${scope ? `const claims = verifyToken(tokens[role]!, process.env.JWT_SECRET!); if (!claims) throw new Error('Invalid fixture session.'); tokens[role] = signToken({ ...claims, scopeId: fixtureScope.id }, process.env.JWT_SECRET!);` : ''}
  }
  console.log(JSON.stringify(tokens));
 } finally { await prisma.$disconnect(); }
}
void main().catch(() => { console.error('Capture accounts could not be prepared.'); process.exitCode = 1; });
`,
      { origin: 'DETERMINISTIC', planElements: elements },
    ),
  );
  files.push(
    file(
      'apps/api/src/auth/deploy-accounts.ts',
      `import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ${account.name}Service } from '../${kebabCase(plan.modules.find((m) => m.localId === account.moduleLocalId)!.name)}/${kebabCase(account.name)}.service';
${scope ? "import { initializeAuthorization } from './initialize-authorization';" : ''}
// Invoked once by the fixed command of a deployment: one initial account per
// role, all with the password the person chose (INITIAL_PASSWORD), which is
// never printed. Only the identifiers are reported.
async function main() {
 const prisma = new PrismaService();
 const accounts: { role: string; identifier: string }[] = [];
 const password = process.env.INITIAL_PASSWORD ?? '';
 if (password.length < 12) throw new Error('INITIAL_PASSWORD must have at least 12 characters.');
 try {
  if (await prisma.${lowerFirst(account.name)}.count()) { console.log('[]'); return; }
  ${
    scope
      ? `await initializeAuthorization(prisma);
  const initialScope = await prisma.${lowerFirst(scopeEntity!.name)}.create({ data: { ...${JSON.stringify(sampleInput(scopeEntity!))}, ${scope.labelField}: 'Ámbito inicial', ${scope.statusField}: ${JSON.stringify(scope.activeStatus)} } });`
      : ''
  }
  const roles = ${JSON.stringify(plan.authentication.roles)} as const;
  for (const [index, role] of roles.entries()) {
   const identifier = 'demo-' + (index + 1) + '-' + randomBytes(3).toString('hex');
   await new ${account.name}Service(prisma).create({ ...${JSON.stringify(createInput)}, ${account.fields
     .filter((field) => field.unique && field.name !== local.loginField && field.type === 'STRING')
     .map((field) =>
       field.name === scope?.displayNameField
         ? `${field.name}: role + ' (demostración)',`
         : `${field.name}: identifier + ${JSON.stringify('-' + field.name)},`,
     )
     .join(
       ' ',
     )} ${local.loginField}: identifier, password, roleNames: [role]${scope ? `, ${scope.accountRelation}Ids: [initialScope.id]` : ''} });
   accounts.push({ role, identifier });
  }
  console.log(JSON.stringify(accounts));
 } finally { await prisma.$disconnect(); }
}
void main().catch(() => { console.error('Initial accounts could not be prepared.'); process.exitCode = 1; });
`,
      { origin: 'DETERMINISTIC', planElements: elements },
    ),
  );
  for (const route of plan.routes) {
    const builtin = route.actions
      .map((a) => plan.customEndpoints.find((e) => `${e.method} ${e.path}` === a.endpoint)?.builtin)
      .find(Boolean);
    const up = toWebRoot(route.path);
    const marker = route.actions[0] ? actionMarker(route.actions[0].label) : '';
    if (builtin === 'LOGIN')
      files.push(
        file(
          pagePath(route.path),
          `'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { api, accessToken${scope ? ', operationScope' : ''} } from '${up}lib/api';
import { Button } from '${up}components/ui/button';
import { Input, PasswordInput } from '${up}components/ui/input';
export default function LoginPage() {
 const router = useRouter(); const cache = useQueryClient(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
 const [expired, setExpired] = useState(false); const [closed, setClosed] = useState(false);
 useEffect(() => { const ended = window.sessionStorage.getItem('session-expired') === 'true'; setExpired(ended); window.sessionStorage.removeItem('session-expired'); setClosed(window.sessionStorage.getItem('session-closed') === 'true'); window.sessionStorage.removeItem('session-closed'); if (ended) cache.clear(); }, [cache]);
 async function submit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget);
  try { const response = await api.postAuthLogin({ identifier: String(data.get('identifier') ?? ''), password: String(data.get('password') ?? '') }); cache.clear(); ${scope ? 'operationScope.clear();' : ''} accessToken.set(response.token); router.replace(${JSON.stringify(homeRoute?.path ?? '/')}); }
  catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo iniciar sesión.'); } finally { setBusy(false); }
 }
 return <div className="flex min-h-screen flex-col bg-muted/40">
 <header className="border-b bg-background px-6 py-4"><p className="text-lg font-semibold">{${JSON.stringify(ctx.projectName)}}</p></header>
 <section className="flex flex-1 items-center justify-center p-6">
 <div className="w-full max-w-lg rounded-lg border border-t-4 border-t-primary bg-background p-8 shadow-sm">
 <h1 className="text-2xl font-semibold">{${JSON.stringify(route.screenName)}}</h1>
 <p className="mt-1 text-muted-foreground">Introduzca sus credenciales para acceder.</p>
 {expired ? <p role="status" className="mt-6 rounded-md border bg-muted p-4 text-sm">Su sesión anterior ha expirado. Inicie sesión nuevamente.</p> : null}{closed ? <p role="status" className="mt-6 rounded-md border bg-muted p-4 text-sm">Sesión cerrada correctamente.</p> : null}
 <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
 <div className="flex flex-col gap-1.5"><label htmlFor="identifier" className="text-sm font-medium">Identificador de acceso <span className="text-destructive" aria-hidden>*</span></label><Input id="identifier" name="identifier" autoComplete="username" required maxLength={255} /></div>
 <div className="flex flex-col gap-1.5"><label htmlFor="password" className="text-sm font-medium">Contraseña <span className="text-destructive" aria-hidden>*</span></label><PasswordInput id="password" name="password" autoComplete="current-password" required maxLength={1024} />
 <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" aria-hidden />La contraseña introducida no se conserva en los registros de acceso.</p></div>
 <Button type="submit" disabled={busy} className="w-full" ${marker}>{busy ? 'Validando…' : ${JSON.stringify(route.actions[0]?.label ?? 'Iniciar sesión')}}{busy ? null : <ArrowRight className="ml-2 h-4 w-4" aria-hidden />}</Button>
 </form>{error ? <p role="alert" className="mt-4 rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p> : null}
 </div></section></div>;
}
`,
          { origin: 'DETERMINISTIC', planElements: [`route:${route.path}`, ...elements] },
        ),
      );
    if (builtin === 'AUTHORIZED_OPTIONS')
      files.push(
        file(
          pagePath(route.path),
          `'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '${up}lib/api';
import { PageState } from '${up}components/page-state';
${scope ? `import { OperationContextPanel } from '${up}components/operation-context';` : ''}
export default function OperationHome() {
 const query = useQuery({ queryKey: ['authorized-options'], queryFn: () => api.getAuthOptions() });
 return <section className="space-y-6"><h1 className="text-2xl font-semibold" ${marker}>{${JSON.stringify(route.screenName)}}</h1>${scope ? `<section ${route.actions.find((action) => action.endpoint === 'GET /auth/context') ? actionMarker(route.actions.find((action) => action.endpoint === 'GET /auth/context')!.label) : ''}><OperationContextPanel ${route.actions.find((action) => action.endpoint === 'POST /auth/context') ? actionMarker(route.actions.find((action) => action.endpoint === 'POST /auth/context')!.label) : ''} /></section>` : ''}<PageState query={query}>{options => <ul className="grid gap-4 md:grid-cols-3">{options.filter(option => option.path !== ${JSON.stringify(route.path)}).map(option => <li key={option.path}><Link className="block rounded-xl border p-6 hover:bg-muted" href={option.path}>{option.label}</Link></li>)}</ul>}</PageState>${scope ? `<Link href={${JSON.stringify(plan.routes.find((item) => item.actions.some((action) => action.endpoint === 'POST /auth/logout'))!.path)}}>Ir al cierre de sesión</Link>` : ''}</section>;
}
`,
          { origin: 'DETERMINISTIC', planElements: [`route:${route.path}`, ...elements] },
        ),
      );
    if (builtin === 'LOGOUT')
      files.push(
        file(
          pagePath(route.path),
          `'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, accessToken${scope ? ', operationScope' : ''} } from '${up}lib/api';
import { Button } from '${up}components/ui/button';
export default function LogoutPage() {
 const router = useRouter(); const cache = useQueryClient(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
 async function close() { setBusy(true); setError(''); try { await api.postAuthLogout({}); window.sessionStorage.setItem('session-closed', 'true'); accessToken.clear(); cache.clear(); ${scope ? 'operationScope.clear();' : ''} router.replace(${JSON.stringify(loginRoute?.path ?? '/access')}); } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo cerrar la sesión.'); } finally { setBusy(false); } }
 return <section className="mx-auto max-w-xl space-y-6"><h1 className="text-2xl font-semibold">{${JSON.stringify(route.screenName)}}</h1><div className="flex flex-wrap gap-3">${route.actions.map((a) => `<Button type="button" disabled={busy} onClick={close} ${actionMarker(a.label)}>{busy ? 'Cerrando…' : ${JSON.stringify(a.label)}}</Button>`).join('')}</div>{error ? <p role="alert">{error}</p> : null}</section>;
}
`,
          { origin: 'DETERMINISTIC', planElements: [`route:${route.path}`, ...elements] },
        ),
      );
  }
  files.push(
    file(
      'docs/auth-profile.json',
      JSON.stringify({
        profile: 'LOCAL_AUTH_SESSION_V1',
        fixtureCommand: 'apps/api/dist/auth/capture-fixtures.js',
      }),
      { kind: 'DOCUMENTATION', origin: 'DETERMINISTIC', planElements: elements },
    ),
  );
  if (!plan.routes.some((route) => route.path === '/access'))
    files.push(
      file(
        'apps/web/app/access/page.tsx',
        `import { redirect } from 'next/navigation';
export default function Access() { redirect(${JSON.stringify(loginRoute?.path ?? '/')}); }`,
        { origin: 'DETERMINISTIC', planElements: elements },
      ),
    );
  if (scope)
    files.push(
      file(
        'apps/api/src/auth/scope-configuration.ts',
        `export const SCOPE_CONFIGURATION = ${JSON.stringify(scopeMetadata(ctx))};`,
        { origin: 'DETERMINISTIC', planElements: elements },
      ),
      file('apps/api/src/auth/operation-scope.ts', OPERATION_SCOPE_RUNTIME, {
        origin: 'DETERMINISTIC',
        planElements: elements,
      }),
      file(
        'apps/api/src/auth/operation-scope.spec.ts',
        `import { describe, expect, it, vi } from 'vitest';
import { enforceScope, scopedTransaction, operationContext, type OperationActor } from './operation-scope';
import { SCOPE_CONFIGURATION } from './scope-configuration';
const model = Object.entries(SCOPE_CONFIGURATION.entities).find(([name, entry]) => name !== SCOPE_CONFIGURATION.scopeModel && entry.policy)?.[0];
const actor = (id: string): OperationActor => ({ userId:'test-user', roles:[], permissions:[], scopeIds:[id], selectedScopeId:id, dataAccess: model ? { [model]:['READ'] } : {} });
describe('operation scope persistence boundary', () => {
 it('wraps transaction delegates with the same context and refuses raw transaction access', async () => {
  if(!model)return;
  const definition=(SCOPE_CONFIGURATION.entities as Record<string,{delegate:string}>)[model]!;
  const findMany=vi.fn(async(args:unknown)=>args);
  const raw={ [definition.delegate]: {findMany} };
  await operationContext.run(actor('A'),async()=>{
   const tx=scopedTransaction(raw) as Record<string,{findMany(args:unknown):Promise<unknown>}>;
   expect(Object.getOwnPropertyDescriptors(tx)).toEqual({});
   expect(Object.getOwnPropertyDescriptors(tx[definition.delegate]!)).toEqual({});
   const args=await tx[definition.delegate]!.findMany({where:{id:'record'}});
   expect(JSON.stringify(args)).toContain('"A"');
   expect(()=>Reflect.get(tx,'$queryRawUnsafe')).toThrow();
  });
  expect(findMany).toHaveBeenCalledTimes(1);
 });
 it('rejects raw operations and unauthorized capabilities before executing a query', async () => {
  const query = vi.fn();
  await expect(operationContext.run(actor('A'), () => enforceScope({},undefined,'$queryRaw',{},query))).rejects.toThrow();
  if(model) await expect(operationContext.run(actor('A'), () => enforceScope({},model,'deleteMany',{},query))).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
 });
 it('denies missing context even when the query has a record identifier', async () => {
  if(!model) return;
  const current=actor('A'); delete current.selectedScopeId; const query=vi.fn();
  await expect(operationContext.run(current, () => enforceScope({},model,'findUnique',{where:{id:'record'}},query))).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
 });
 it('keeps simultaneous requests isolated and preserves their original filters', async () => {
  if(!model) return;
  const results=await Promise.all(['A','B'].map(id=>operationContext.run(actor(id),async()=>{
   await new Promise(resolve=>setTimeout(resolve,5));
   return enforceScope({},model,'findMany',{where:{id:'record'}},async args=>args);
  })));
  expect(JSON.stringify(results[0])).toContain('"A"'); expect(JSON.stringify(results[0])).not.toContain('"B"');
  expect(JSON.stringify(results[1])).toContain('"B"'); expect(JSON.stringify(results[1])).not.toContain('"A"');
  expect(JSON.stringify(results[0])).toContain('record');
 });
});`,
        { origin: 'DETERMINISTIC', kind: 'TEST', planElements: elements },
      ),
      ...operationContextFiles(ctx),
      file(
        'apps/api/src/auth/initialize-authorization.ts',
        `import type { PrismaService } from '../prisma/prisma.service';
const defaults: Record<string,string[]> = ${JSON.stringify(roleOperations(ctx))};
export async function initializeAuthorization(prisma: PrismaService, restore = false) {
 for (const operation of new Set(Object.values(defaults).flat())) await prisma.${lowerFirst(permissionEntity!.name)}.upsert({ where: { ${scope.permissionOperationField}: operation }, create: { ${scope.permissionOperationField}: operation }, update: {} });
 for (const [name, operations] of Object.entries(defaults)) {
  const links = operations.map(operation => ({ ${scope.permissionOperationField}: operation }));
  await prisma.${lowerFirst(roleEntity.name)}.upsert({ where: { ${local.roleNameField}: name }, create: { ${local.roleNameField}: name, ${scope.permissionRelation}: { connect: links } }, update: restore ? { ${scope.permissionRelation}: { set: links } } : {} });
 }
}
`,
        { origin: 'DETERMINISTIC', planElements: elements },
      ),
    );
  return files;
}
