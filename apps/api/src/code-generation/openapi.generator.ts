import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { PlanGenerationError, collectionPath, pluralize, upperFirst } from './naming';

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

function entitySchemas(entity: Entity): Record<string, Schema> {
  const properties: Record<string, Schema> = {};
  const required: string[] = [];
  for (const field of entity.fields) {
    properties[field.name] = fieldSchema(field);
    if (field.required) required.push(field.name);
  }
  for (const relation of foreignKeys(entity)) {
    properties[`${relation.name}Id`] = relation.required ? uuid : { ...uuid, nullable: true };
    if (relation.required) required.push(`${relation.name}Id`);
  }
  const readOnly = {
    id: uuid,
    ...properties,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  };
  return {
    [entity.name]: {
      type: 'object',
      properties: readOnly,
      required: ['id', ...required, 'createdAt', 'updatedAt'],
    },
    [`Create${entity.name}Input`]: {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    },
    [`Update${entity.name}Input`]: { type: 'object', properties, additionalProperties: false },
  };
}

export function generateOpenApi(plan: ImplementationPlanContent, title: string): Schema {
  const modules = new Map(plan.modules.map((m) => [m.localId, m.name]));
  const entities = new Map(plan.entities.map((e) => [e.localId, e]));
  const security = plan.authentication.required ? [{ bearerAuth: [] }] : undefined;
  const paths: Record<string, Record<string, Schema>> = {};
  const operationIds = new Set<string>();

  const addOperation = (path: string, method: string, operation: Schema) => {
    paths[path] ??= {};
    if (paths[path][method])
      throw new PlanGenerationError(
        `Dos operaciones usan ${method.toUpperCase()} ${path}; el endpoint personalizado choca con uno CRUD.`,
      );
    const id = operation.operationId as string;
    if (operationIds.has(id))
      throw new PlanGenerationError(`El identificador de operación «${id}» se repite.`);
    operationIds.add(id);
    paths[path][method] = { ...operation, ...(security ? { security } : {}) };
  };
  const json = (schema: Schema) => ({ content: { 'application/json': { schema } } });
  const idParam = { name: 'id', in: 'path', required: true, schema: uuid };
  const notFound = { description: 'No encontrado.' };

  for (const entity of plan.entities) {
    const tags = [modules.get(entity.moduleLocalId)!];
    const base = collectionPath(entity.name);
    const item = `${base}/{id}`;
    const plural = pluralize(entity.name);
    for (const operation of entity.operations) {
      if (operation === 'LIST')
        addOperation(base, 'get', {
          operationId: `list${plural}`,
          tags,
          summary: `Listar ${plural}`,
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
    const words = endpoint.path
      .split('/')
      .filter((segment) => segment && !segment.startsWith(':'))
      .flatMap((segment) => segment.split('-'))
      .map(upperFirst)
      .join('');
    const entity = endpoint.entityLocalId ? entities.get(endpoint.entityLocalId) : undefined;
    const hasBody = ['POST', 'PATCH', 'PUT'].includes(endpoint.method);
    addOperation(path, endpoint.method.toLowerCase(), {
      operationId: `${endpoint.method.toLowerCase()}${words}`,
      tags: [modules.get(endpoint.moduleLocalId)!],
      summary: endpoint.summary,
      ...(params.length ? { parameters: params } : {}),
      ...(hasBody
        ? {
            requestBody: {
              required: true,
              ...json({ type: 'object', additionalProperties: true }),
            },
          }
        : {}),
      responses: {
        '200': {
          description: 'OK',
          ...json(entity ? ref(entity.name) : { type: 'object', additionalProperties: true }),
        },
      },
    });
  }

  return {
    openapi: '3.0.3',
    info: { title, version: '1.0.0' },
    paths,
    components: {
      schemas: Object.assign({}, ...plan.entities.map(entitySchemas)),
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
