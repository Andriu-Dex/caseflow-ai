import { customEndpointOperationId } from './naming';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { PlanGenerationError, collectionPath, pluralize } from './naming';
import { manyInputRelations } from './engine/contracts.templates';
import { actionValueOpenApi } from './engine/action-contract.templates';

type Entity = ImplementationPlanContent['entities'][number];
type Field = Entity['fields'][number];
type Schema = Record<string, unknown>;

// Deterministic Implementation Plan -> OpenAPI 3.0 document (DEC-099: OpenAPI
// is the contract the generated TypeScript client derives from). Decimals
// travel as strings so no precision is lost between backend and frontend.

const FIELD_SCHEMA: Record<Exclude<Field['type'], 'ENUM'>, Schema> = {
  STRING: { type: 'string' },
  TEXT: { type: 'string' },
  INT: { type: 'integer' },
  DECIMAL: { type: 'string', format: 'decimal' },
  BOOLEAN: { type: 'boolean' },
  DATE: { type: 'string', format: 'date' },
  DATETIME: { type: 'string', format: 'date-time' },
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const uuid = { type: 'string', format: 'uuid' };

function fieldSchema(field: Field): Schema {
  const base =
    field.type === 'ENUM' ? { type: 'string', enum: field.enumValues } : FIELD_SCHEMA[field.type];
  return field.description ? { ...base, description: field.description } : { ...base };
}

// Foreign keys a client sends/receives for owning-side relations.
const foreignKeys = (entity: Entity) => entity.relations.filter((r) => r.kind !== 'MANY_TO_MANY');

function entitySchemas(entity: Entity, plan: ImplementationPlanContent): Record<string, Schema> {
  const properties: Record<string, Schema> = {};
  const required: string[] = [];
  for (const field of entity.fields.filter((field) => !field.internal)) {
    properties[field.name] = fieldSchema(field);
    if (field.required) required.push(field.name);
  }
  for (const relation of foreignKeys(entity)) {
    properties[`${relation.name}Id`] = relation.required ? uuid : { ...uuid, nullable: true };
    if (relation.required) required.push(`${relation.name}Id`);
  }
  const account = plan.authentication.local?.userEntityLocalId === entity.localId;
  const many = Object.fromEntries(
    manyInputRelations(entity, plan).map((relation) => [
      relation.name + 'Ids',
      { type: 'array', items: uuid, maxItems: 500, uniqueItems: true },
    ]),
  );
  const readOnly = {
    id: uuid,
    ...properties,
    ...many,
    ...(account ? { roleNames: { type: 'array', items: { type: 'string' } } } : {}),
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  };
  const actorField = entity.operationScope?.actorRelation
    ? entity.operationScope.actorRelation + 'Id'
    : undefined;
  const editable = Object.fromEntries(
    Object.entries(properties).filter(
      ([key]) =>
        key !== actorField && !entity.fields.some((field) => field.name === key && field.readOnly),
    ),
  );
  const inputs = account
    ? {
        ...editable,
        ...many,
        password: {
          type: 'string',
          format: 'password',
          writeOnly: true,
          minLength: 12,
          maxLength: 1024,
        },
        roleNames: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', enum: plan.authentication.roles },
        },
      }
    : { ...editable, ...many };
  const inputRequired = required.filter(
    (key) =>
      key !== actorField && !entity.fields.some((field) => field.name === key && field.readOnly),
  );
  return {
    [entity.name]: {
      type: 'object',
      properties: readOnly,
      required: [
        'id',
        ...required,
        ...Object.keys(many),
        ...(account ? ['roleNames'] : []),
        'createdAt',
        'updatedAt',
      ],
    },
    [`Create${entity.name}Input`]: {
      type: 'object',
      properties: inputs,
      ...(inputRequired.length || account
        ? { required: [...inputRequired, ...(account ? ['password', 'roleNames'] : [])] }
        : {}),
      additionalProperties: false,
    },
    [`Update${entity.name}Input`]: {
      type: 'object',
      properties: inputs,
      additionalProperties: false,
    },
  };
}

// "POST /orders/:orderId/confirm" -> "postOrdersConfirm"; the generated
// frontend calls the API client by this same name.
export { customEndpointOperationId } from './naming';

export function generateOpenApi(plan: ImplementationPlanContent, title: string): Schema {
  const modules = new Map(plan.modules.map((m) => [m.localId, m.name]));
  const entities = new Map(plan.entities.map((e) => [e.localId, e]));
  const security = plan.authentication.required ? [{ bearerAuth: [] }] : undefined;
  const paths: Record<string, Record<string, Schema>> = {};
  const operationIds = new Set<string>();
  const routeSignatures = new Set<string>();

  const addOperation = (path: string, method: string, operation: Schema) => {
    const signature = method + ' ' + path.replace(/\{[^}]+\}/g, '{}');
    paths[path] ??= {};
    if (paths[path][method] || routeSignatures.has(signature))
      throw new PlanGenerationError(
        `Dos operaciones usan ${method.toUpperCase()} ${path}; el endpoint personalizado choca con uno CRUD.`,
      );
    const id = operation.operationId as string;
    if (operationIds.has(id))
      throw new PlanGenerationError(`El identificador de operación «${id}» se repite.`);
    operationIds.add(id);
    routeSignatures.add(signature);
    paths[path][method] = {
      ...operation,
      ...(security && operation.security === undefined ? { security } : {}),
    };
  };
  const json = (schema: Schema) => ({ content: { 'application/json': { schema } } });
  const idParam = { name: 'id', in: 'path', required: true, schema: uuid };
  const notFound = { description: 'No encontrado.' };

  for (const entity of plan.entities) {
    const tags = [modules.get(entity.moduleLocalId)!];
    const base = collectionPath(entity.name);
    const item = `${base}/{id}`;
    const plural = pluralize(entity.name);
    const hasDateField = entity.fields.some((f) => f.type === 'DATE' || f.type === 'DATETIME');
    for (const operation of entity.operations) {
      if (operation === 'LIST')
        addOperation(base, 'get', {
          operationId: `list${plural}`,
          tags,
          summary: `Listar ${plural}`,
          parameters: [
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1 },
              description: 'Número de página.',
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 500 },
              description: 'Límite de registros por página.',
            },
            ...(hasDateField
              ? [
                  {
                    name: 'from',
                    in: 'query',
                    required: false,
                    schema: { type: 'string', format: 'date' },
                    description: 'Filtro de fecha inicial (ISO YYYY-MM-DD).',
                  },
                  {
                    name: 'to',
                    in: 'query',
                    required: false,
                    schema: { type: 'string', format: 'date' },
                    description: 'Filtro de fecha final (ISO YYYY-MM-DD).',
                  },
                ]
              : []),
          ],
          responses: {
            '200': { description: 'OK', ...json({ type: 'array', items: ref(entity.name) }) },
          },
        });
      if (operation === 'CREATE')
        addOperation(base, 'post', {
          operationId: `create${entity.name}`,
          tags,
          summary: `Crear ${entity.name}`,
          requestBody: { required: true, ...json(ref(`Create${entity.name}Input`)) },
          responses: { '201': { description: 'Creado', ...json(ref(entity.name)) } },
        });
      if (operation === 'GET')
        addOperation(item, 'get', {
          operationId: `get${entity.name}`,
          tags,
          summary: `Consultar ${entity.name}`,
          parameters: [idParam],
          responses: { '200': { description: 'OK', ...json(ref(entity.name)) }, '404': notFound },
        });
      if (operation === 'UPDATE')
        addOperation(item, 'patch', {
          operationId: `update${entity.name}`,
          tags,
          summary: `Actualizar ${entity.name}`,
          parameters: [idParam],
          requestBody: { required: true, ...json(ref(`Update${entity.name}Input`)) },
          responses: { '200': { description: 'OK', ...json(ref(entity.name)) }, '404': notFound },
        });
      if (operation === 'DELETE')
        addOperation(item, 'delete', {
          operationId: `delete${entity.name}`,
          tags,
          summary: `Eliminar ${entity.name}`,
          parameters: [idParam],
          responses: { '204': { description: 'Eliminado' }, '404': notFound },
        });
    }
  }

  for (const endpoint of plan.customEndpoints) {
    const path = endpoint.path.replace(/:([a-zA-Z0-9]+)/g, '{$1}');
    const params = [...path.matchAll(/\{([a-zA-Z0-9]+)\}/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    const entity = endpoint.entityLocalId ? entities.get(endpoint.entityLocalId) : undefined;
    const hasBody = ['POST', 'PATCH', 'PUT'].includes(endpoint.method) && !endpoint.disabledReason;
    addOperation(path, endpoint.method.toLowerCase(), {
      operationId: customEndpointOperationId(endpoint),
      tags: [modules.get(endpoint.moduleLocalId)!],
      summary: endpoint.summary,
      ...(endpoint.builtin === 'LOGIN' ? { security: [] } : {}),
      ...(params.length || endpoint.contract?.query
        ? {
            parameters: [
              ...params,
              ...(endpoint.contract?.query?.properties ?? []).map((field) => ({
                name: field.name,
                in: 'query',
                required: field.required !== false,
                schema: actionValueOpenApi(field.value),
              })),
            ],
          }
        : {}),
      ...(hasBody
        ? {
            requestBody: {
              required: true,
              ...json(
                endpoint.builtin === 'LOGIN'
                  ? ref('AuthLoginInput')
                  : endpoint.builtin === 'SELECT_SCOPE'
                    ? ref('SelectScopeInput')
                    : endpoint.contract?.body
                      ? actionValueOpenApi(endpoint.contract.body)
                      : { type: 'object', additionalProperties: true },
              ),
            },
          }
        : {}),
      responses: endpoint.disabledReason
        ? { '403': { description: endpoint.disabledReason } }
        : {
            '200': {
              description: 'OK',
              ...json(
                endpoint.builtin === 'LOGIN'
                  ? ref('AuthSession')
                  : endpoint.builtin === 'AUTH_CONTEXT'
                    ? ref('OperationContext')
                    : endpoint.builtin === 'SELECT_SCOPE'
                      ? ref('SelectScopeInput')
                      : endpoint.builtin === 'AUTHORIZED_OPTIONS'
                        ? { type: 'array', items: ref('AuthorizedOption') }
                        : endpoint.builtin === 'LOGOUT'
                          ? {
                              type: 'object',
                              properties: { closed: { type: 'boolean' } },
                              required: ['closed'],
                            }
                          : endpoint.contract
                            ? actionValueOpenApi(endpoint.contract.response)
                            : entity
                              ? ref(entity.name)
                              : { type: 'object', additionalProperties: true },
              ),
            },
          },
    });
  }

  return {
    openapi: '3.0.3',
    info: { title, version: '1.0.0' },
    paths,
    components: {
      schemas: Object.assign(
        {},
        ...plan.entities.map((entity) => entitySchemas(entity, plan)),
        plan.authentication.local
          ? {
              AuthLoginInput: {
                type: 'object',
                required: ['identifier', 'password'],
                additionalProperties: false,
                properties: {
                  identifier: { type: 'string', minLength: 1, maxLength: 255 },
                  password: {
                    type: 'string',
                    format: 'password',
                    writeOnly: true,
                    minLength: 1,
                    maxLength: 1024,
                  },
                },
              },
              AuthSession: {
                type: 'object',
                required: ['token', 'userId', 'roles', 'expiresAt'],
                properties: {
                  token: { type: 'string' },
                  userId: { type: 'string', format: 'uuid' },
                  roles: { type: 'array', items: { type: 'string' } },
                  expiresAt: { type: 'string', format: 'date-time' },
                },
              },
              AuthorizedOption: {
                type: 'object',
                required: ['path', 'label'],
                properties: { path: { type: 'string' }, label: { type: 'string' } },
              },
              ...(plan.authentication.local.scope
                ? {
                    SelectScopeInput: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['scopeId'],
                      properties: { scopeId: uuid },
                    },
                    OperationContext: {
                      type: 'object',
                      required: [
                        'userId',
                        'displayName',
                        'userStatus',
                        'roles',
                        'permissions',
                        'scopes',
                        'selectedScopeId',
                      ],
                      properties: {
                        userId: uuid,
                        displayName: { type: 'string' },
                        userStatus: { type: 'string' },
                        roles: { type: 'array', items: { type: 'string' } },
                        permissions: { type: 'array', items: { type: 'string' } },
                        scopes: {
                          type: 'array',
                          items: {
                            type: 'object',
                            required: ['id', 'label', 'status', 'details'],
                            properties: {
                              id: uuid,
                              label: { type: 'string' },
                              status: { type: 'string' },
                              details: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  required: ['label', 'value'],
                                  properties: {
                                    label: { type: 'string' },
                                    value: { type: 'string' },
                                  },
                                },
                              },
                            },
                          },
                        },
                        selectedScopeId: { ...uuid, nullable: true },
                      },
                    },
                  }
                : {}),
            }
          : {},
      ),
      ...(security
        ? {
            securitySchemes: {
              bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
          }
        : {}),
    },
  };
}
