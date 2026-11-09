import type { GenerationContext } from './types';
import { collectionPath, lowerFirst, pluralize, upperFirst } from '../naming';

export function roleOperations({ plan }: Pick<GenerationContext, 'plan'>) {
  const grants = Object.fromEntries(
    plan.authentication.roles.map((role) => [role, [] as string[]]),
  );
  const add = (operation: string, roles: string[]) => {
    for (const role of roles.length ? roles : plan.authentication.roles)
      grants[role]!.push(operation);
  };
  for (const entity of plan.entities)
    for (const operation of entity.operations) {
      const method = { LIST: 'GET', GET: 'GET', CREATE: 'POST', UPDATE: 'PATCH', DELETE: 'DELETE' }[
        operation
      ];
      add(
        `${method} ${collectionPath(entity.name)}${['GET', 'UPDATE', 'DELETE'].includes(operation) ? '/:id' : ''}`,
        ['LIST', 'GET'].includes(operation) ? entity.readRoles : entity.writeRoles,
      );
    }
  for (const endpoint of plan.customEndpoints)
    if (!endpoint.builtin || endpoint.builtin === 'ACCOUNT_DEACTIVATE')
      add(`${endpoint.method} ${endpoint.path}`, endpoint.roles);
  return Object.fromEntries(
    Object.entries(grants).map(([role, operations]) => [role, [...new Set(operations)]]),
  );
}

export function scopeMetadata({ plan }: GenerationContext) {
  const byId = new Map(plan.entities.map((entity) => [entity.localId, entity]));
  const scope = plan.authentication.local!.scope!;
  const entities = Object.fromEntries(
    plan.entities.map((entity) => [
      entity.name,
      {
        delegate: lowerFirst(entity.name),
        collection: collectionPath(entity.name),
        internalFields: entity.fields.filter((field) => field.internal).map((field) => field.name),
        policy: entity.operationScope ?? null,
        relations: Object.fromEntries(
          entity.relations.map((relation) => [
            relation.name,
            {
              target: byId.get(relation.targetEntityLocalId)!.name,
              many: relation.kind === 'MANY_TO_MANY',
            },
          ]),
        ),
      },
    ]),
  );
  for (const entity of plan.entities)
    for (const relation of entity.relations) {
      const target = byId.get(relation.targetEntityLocalId)!;
      const multiple =
        entity.relations.filter((item) => item.targetEntityLocalId === target.localId).length > 1;
      const inverse =
        relation.kind === 'ONE_TO_ONE'
          ? lowerFirst(entity.name)
          : lowerFirst(pluralize(entity.name)) + (multiple ? `As${upperFirst(relation.name)}` : '');
      entities[target.name]!.relations[inverse] = {
        target: entity.name,
        many: relation.kind !== 'ONE_TO_ONE',
      };
    }
  return {
    entities,
    scopeModel: byId.get(scope.entityLocalId)!.name,
    accountModel: byId.get(plan.authentication.local!.userEntityLocalId)!.name,
    sessionModel: byId.get(plan.authentication.local!.sessionEntityLocalId)!.name,
    authorizationModels: [
      byId.get(
        plan.entities
          .find((entity) => entity.localId === plan.authentication.local!.userEntityLocalId)!
          .relations.find((relation) => relation.name === plan.authentication.local!.roleRelation)!
          .targetEntityLocalId,
      )!,
    ].flatMap((role) => [
      role.name,
      byId.get(
        role.relations.find((relation) => relation.name === scope.permissionRelation)!
          .targetEntityLocalId,
      )!.name,
    ]),
    unrestrictedRoles: scope.unrestrictedRoles,
  };
}

export const OPERATION_SCOPE_RUNTIME = `import { AsyncLocalStorage } from 'node:async_hooks';
import { BadRequestException, ForbiddenException, Injectable, type NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { SCOPE_CONFIGURATION } from './scope-configuration';
export interface OperationActor { userId: string; roles: string[]; permissions: string[]; scopeIds: string[]; selectedScopeId?: string; scopeAccess?: 'SELECTED' | 'ASSIGNED_SET'; currentOperation?: string; dataAccess?: Record<string, string[]>; }
export const operationContext = new AsyncLocalStorage<OperationActor | undefined>();
type Data = Record<string, unknown>;
type Policy = { paths: string[][]; includeUnscoped: boolean; ownerRelation?: string; actorRelation?: string };
type Model = { delegate: string; collection: string; internalFields: string[]; policy: Policy | null; relations: Record<string, { target: string; many: boolean }> };
const models = SCOPE_CONFIGURATION.entities as Record<string, Model>;
const object = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
const values = (value: unknown) => Array.isArray(value) ? value : [value];
const unrestricted = (actor: OperationActor) => actor.roles.some(role => SCOPE_CONFIGURATION.unrestrictedRoles.includes(role));
function authorize(model: string, operation: string, actor: OperationActor) {
 const definition = models[model]!;
 if (operation !== 'READ' && [SCOPE_CONFIGURATION.accountModel, ...SCOPE_CONFIGURATION.authorizationModels].includes(model) && !unrestricted(actor)) throw new ForbiddenException('La administración de acceso requiere un rol global.');
 if (actor.dataAccess !== undefined) {
  if (!actor.dataAccess[model]?.includes(operation)) throw new ForbiddenException('La operación no dispone de esta capacidad de datos.');
  return;
 }
 const accountCollection = models[SCOPE_CONFIGURATION.accountModel]!.collection;
 const deactivation = actor.currentOperation === 'POST /auth/accounts/:userId/deactivate';
 const credentialUpdate = actor.currentOperation === 'PATCH ' + accountCollection + '/:id';
 if (operation === 'READ' && actor.currentOperation && actor.permissions.includes(actor.currentOperation) && ['PATCH '+definition.collection+'/:id','DELETE '+definition.collection+'/:id'].includes(actor.currentOperation)) return;
 if (model === SCOPE_CONFIGURATION.sessionModel && operation === 'UPDATE' && (actor.currentOperation === 'POST /auth/logout' || deactivation || credentialUpdate)) return;
 if (model === SCOPE_CONFIGURATION.accountModel && operation === 'UPDATE' && deactivation) return;
 const keys = operation === 'READ' ? ['GET ' + definition.collection, 'GET ' + definition.collection + '/:id'] : [(operation === 'CREATE' ? 'POST ' : operation === 'UPDATE' ? 'PATCH ' : 'DELETE ') + definition.collection + (operation === 'CREATE' ? '' : '/:id')];
 if (!keys.some(key => actor.permissions.includes(key))) throw new ForbiddenException('No tiene permiso para acceder a estos datos.');
}
const nested = (path: string[], leaf: Data): Data => path.reduceRight((result, name) => ({ [name]: { is: result } }), leaf);
function selectedIds(actor: OperationActor): string[] {
 if (actor.scopeAccess === 'ASSIGNED_SET') {
  if (!unrestricted(actor)) throw new ForbiddenException('No tiene permiso para consultar varios ámbitos.');
  return actor.scopeIds;
 }
 if (!actor.selectedScopeId || !actor.scopeIds.includes(actor.selectedScopeId)) throw new ForbiddenException('Seleccione un ámbito autorizado para continuar.');
 return [actor.selectedScopeId];
}
export function scopedWhere(model: string, actor: OperationActor, writing = false): Data {
 const policy = models[model]?.policy;
 if (!policy) return {};
 if (model === SCOPE_CONFIGURATION.scopeModel) return unrestricted(actor) ? {} : { id: { in: actor.scopeIds } };
 if (writing && actor.scopeAccess === 'ASSIGNED_SET') throw new ForbiddenException('La comparación entre ámbitos asignados es de solo lectura.');
 const ids = selectedIds(actor);
 const direct = policy.paths.filter(path => path.length === 1);
 const paths = direct.length ? direct : policy.paths;
 const matches = paths.map(path => nested(path, { id: { in: ids } }));
 const checks: Data[] = paths.map((path, index) => ({ OR: [{ NOT: nested(path, {}) }, matches[index]!] }));
 if (!policy.includeUnscoped) checks.push({ OR: matches });
 if (policy.ownerRelation) checks.push({ [policy.ownerRelation + 'Id']: actor.userId });
 return { AND: checks };
}
function validateProjection(model: string, value: unknown, actor: OperationActor) {
 const projection = object(value);
 for (const [name, selected] of Object.entries(projection)) {
  if (!selected) continue;
  if (models[model]!.internalFields.includes(name)) throw new ForbiddenException('No se pueden consultar campos internos.');
  if (name === '_count') throw new BadRequestException('Consulte los conteos mediante operaciones con alcance explícito.');
  const relation = models[model]?.relations[name];
  if (!relation) continue;
  if (relation.target === SCOPE_CONFIGURATION.accountModel && !unrestricted(actor)) throw new ForbiddenException('Consulte únicamente su cuenta mediante una operación directa.');
  authorize(relation.target, 'READ', actor);
  if (models[relation.target]?.policy && !(relation.target === SCOPE_CONFIGURATION.scopeModel && unrestricted(actor))) throw new BadRequestException('Consulte las relaciones de ámbito de operación mediante consultas separadas con alcance.');
  const config = object(selected);
  validateProjection(relation.target, config.include, actor); validateProjection(relation.target, config.select, actor);
  const hidden = models[relation.target]!.internalFields;
  if (hidden.length && !config.select) { config.omit = {...object(config.omit),...Object.fromEntries(hidden.map(name=>[name,true]))}; projection[name]=config; }
 }
}
function validateFilter(model: string, value: unknown) {
 if (Array.isArray(value)) { for (const filter of value) validateFilter(model, filter); return; }
 for (const [name, filter] of Object.entries(object(value))) {
  if (models[model]!.internalFields.includes(name)) throw new ForbiddenException('No se pueden consultar campos internos.');
  if (['AND', 'OR', 'NOT'].includes(name)) { for (const condition of values(filter)) validateFilter(model, condition); continue; }
  const relation = models[model]?.relations[name];
  if (!relation) continue;
  if (models[relation.target]?.policy) throw new BadRequestException('Utilice una consulta directa con alcance para filtrar esta relación.');
  for (const nestedFilter of Object.values(object(filter))) validateFilter(relation.target, nestedFilter);
 }
}
interface Database { [delegate: string]: { findFirst(args: Data): Promise<unknown> }; }
async function assertRelated(database: Database, model: string, id: unknown, actor: OperationActor, forceSelected: boolean) {
 if (typeof id !== 'string') throw new BadRequestException('Indique un identificador válido.');
 const scope = forceSelected && model === SCOPE_CONFIGURATION.scopeModel ? { id: { in: selectedIds(actor) } } : scopedWhere(model, actor);
 const found = await database[models[model]!.delegate]!.findFirst({ where: { AND: [{ id }, scope] }, select: { id: true } });
 if (!found) throw new ForbiddenException('El registro relacionado no pertenece al alcance autorizado.');
}
async function validateData(database: Database, model: string, input: unknown, actor: OperationActor, creating: boolean): Promise<void> {
 const data = object(input), definition = models[model]!;
 const policy = definition.policy;
 if (policy?.actorRelation) {
  const key = policy.actorRelation + 'Id';
  if (!creating && key in data) throw new BadRequestException('No se puede modificar la autoría del registro.');
  if (creating) {
   if (data[key] !== undefined && data[key] !== actor.userId) throw new ForbiddenException('La autoría debe corresponder a la sesión actual.');
   data[key] = actor.userId;
  }
 }
 if (policy?.ownerRelation && data[policy.ownerRelation + 'Id'] !== undefined && data[policy.ownerRelation + 'Id'] !== actor.userId)
  throw new ForbiddenException('El registro debe pertenecer a la cuenta actual.');
 if (policy && model !== SCOPE_CONFIGURATION.scopeModel) {
  selectedIds(actor);
  if (creating) {
   const supplied = policy.paths.some(path => path.length && (data[path[0]! + 'Id'] != null || data[path[0]!] != null));
   if (!supplied && (!policy.includeUnscoped || !policy.ownerRelation && !unrestricted(actor))) throw new ForbiddenException('Indique el alcance del registro.');
  }
  if (!creating && policy.paths.some(path => path.length && data[path[0]! + 'Id'] === null)) throw new ForbiddenException('No se puede retirar el alcance de un registro existente.');
 }
 for (const [name, relation] of Object.entries(definition.relations)) {
  const key = name + 'Id';
  if (data[key] !== undefined && data[key] !== null && models[relation.target]?.policy)
   await assertRelated(database, relation.target, data[key], actor, Boolean(policy));
  if (!(name in data)) continue;
  if (policy?.actorRelation === name || policy?.ownerRelation === name) throw new ForbiddenException('La identidad se establece desde la sesión actual.');
  const changes = object(data[name]);
  for (const [action, content] of Object.entries(changes)) {
   if (models[relation.target]?.policy) {
    if (!['connect', 'disconnect', 'set'].includes(action)) throw new BadRequestException('Esta escritura anidada requiere operaciones separadas dentro de una transacción.');
    for (const entry of values(content)) {
     const selector = object(entry);
     if (Object.keys(selector).length !== 1 || !('id' in selector)) throw new BadRequestException('Utilice identificadores explícitos para relacionar registros.');
     await assertRelated(database, relation.target, selector.id, actor, Boolean(policy));
    }
   } else if (action === 'create' || action === 'update') {
    authorize(relation.target, action === 'create' ? 'CREATE' : 'UPDATE', actor);
    for (const item of values(content)) await validateData(database, relation.target, object(item).data ?? item, actor, action === 'create');
   } else if (action === 'connectOrCreate' || action === 'upsert') {
    authorize(relation.target, 'CREATE', actor); if (action === 'upsert') authorize(relation.target, 'UPDATE', actor);
    for (const item of values(content)) {
     const nestedData = object(item);
     if (nestedData.create) await validateData(database, relation.target, nestedData.create, actor, true);
     if (nestedData.update) await validateData(database, relation.target, nestedData.update, actor, false);
    }
   } else if (!['connect', 'disconnect', 'set'].includes(action)) throw new BadRequestException('La operación anidada no está soportada en este contexto.');
  }
 }
}
export async function enforceScope(database: unknown, model: string | undefined, operation: string, input: unknown, query: (args: never) => Promise<unknown>) {
 const actor = operationContext.getStore();
 if (!actor) return query(input as never);
 if (!model || !models[model]) throw new ForbiddenException('La operación no está permitida en el contexto actual.');
 const args = object(input);
 const writes = ['create','createMany','createManyAndReturn','update','updateMany','updateManyAndReturn','delete','deleteMany','upsert'];
 const reads = ['findUnique','findUniqueOrThrow','findFirst','findFirstOrThrow','findMany','count','aggregate','groupBy'];
 if (![...reads,...writes].includes(operation)) throw new ForbiddenException('Operación de datos no admitida.');
 const writing = writes.includes(operation);
 authorize(model, !writing ? 'READ' : operation.startsWith('create') ? 'CREATE' : operation.startsWith('delete') ? 'DELETE' : 'UPDATE', actor);
 if (operation === 'upsert') authorize(model, 'CREATE', actor);
 if (writing && actor.scopeAccess === 'ASSIGNED_SET') throw new ForbiddenException('La comparación entre ámbitos asignados es de solo lectura.');
 validateProjection(model, args.include, actor); validateProjection(model, args.select, actor); validateFilter(model, args.where);
 for (const key of ['orderBy','having','_min','_max','_sum','_avg','_count']) validateFilter(model,args[key]);
 for (const key of ['by','distinct']) if(values(args[key]).some(value=>typeof value==='string'&&models[model]!.internalFields.includes(value))) throw new ForbiddenException('No se pueden consultar campos internos.');
 if (models[model]!.internalFields.length && !args.select && !['count','aggregate','groupBy','createMany','updateMany','deleteMany'].includes(operation)) args.omit = {...object(args.omit),...Object.fromEntries(models[model]!.internalFields.map(name=>[name,true]))};
 const filter = scopedWhere(model, actor, writing);
 if (model === SCOPE_CONFIGURATION.accountModel && !unrestricted(actor)) Object.assign(filter, { id: actor.userId });
 if (!['create','createMany','createManyAndReturn'].includes(operation)) args.where = { ...object(args.where), AND: [object(args.where), filter] };
 if (args.data) for (const data of values(args.data)) await validateData(database as Database, model, data, actor, operation.startsWith('create'));
 if (args.create) await validateData(database as Database, model, args.create, actor, true);
 if (args.update) await validateData(database as Database, model, args.update, actor, false);
 return query(args as never);
}
export function scopedTransaction(database: unknown): unknown {
 if(!operationContext.getStore()) return database;
 const delegates=Object.fromEntries(Object.entries(models).map(([model,definition])=>[definition.delegate,model]));
 return new Proxy(Object.create(null) as object,{get(_target,key){
  if(typeof key!=='string'||!delegates[key]) throw new ForbiddenException('La transacción solo permite los delegados declarados.');
  const delegate=Reflect.get(database as object,key) as object;
  return new Proxy(Object.create(null) as object,{get(_subject,operation){
   if(typeof operation!=='string'||typeof Reflect.get(delegate,operation)!=='function') throw new ForbiddenException('La operación de datos no está permitida.');
   return (args:unknown)=>enforceScope(database,delegates[key],operation,args,checked=>Reflect.apply(Reflect.get(delegate,operation) as (args:unknown)=>Promise<unknown>,delegate,[checked]));
  }});
 }});
}
@Injectable()
export class OperationScopeInterceptor implements NestInterceptor {
 intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
  const actor = context.switchToHttp().getRequest<{ user?: OperationActor }>().user;
  return new Observable(subscriber => operationContext.run(actor, () => {
   const subscription = next.handle().subscribe(subscriber);
   return () => subscription.unsubscribe();
  }));
 }
}
`;
