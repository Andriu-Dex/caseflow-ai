import type { ActionValueDefinition } from '@caseflow-ai/contracts';

export function actionValueOpenApi(value: ActionValueDefinition): Record<string, unknown> {
  let schema: Record<string, unknown>;
  switch (value.type) {
    case 'OBJECT':
      schema = {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(
          (value.properties ?? []).map((field) => [field.name, actionValueOpenApi(field.value)]),
        ),
        required: (value.properties ?? [])
          .filter((field) => field.required !== false)
          .map((field) => field.name),
      };
      break;
    case 'ARRAY':
      schema = {
        type: 'array',
        items: actionValueOpenApi(value.items!),
        minItems: value.minItems ?? 0,
        maxItems: value.maxItems ?? 1000,
      };
      break;
    case 'INT':
      schema = {
        type: 'integer',
        ...(value.minimum !== undefined ? { minimum: value.minimum } : {}),
        ...(value.maximum !== undefined ? { maximum: value.maximum } : {}),
      };
      break;
    case 'BOOLEAN':
      schema = { type: 'boolean' };
      break;
    case 'ENUM':
      schema = { type: 'string', enum: value.enumValues };
      break;
    default:
      schema = {
        type: 'string',
        ...{
          UUID: { format: 'uuid' },
          DECIMAL: { pattern: '^-?\\d{1,10}(\\.\\d{1,2})?$' },
          DATE: { format: 'date' },
          DATETIME: { format: 'date-time' },
          STRING: { minLength: value.minLength ?? 0, maxLength: value.maxLength ?? 10000 },
        }[value.type],
      };
  }
  return {
    ...schema,
    ...(value.nullable ? { nullable: true } : {}),
    ...(value.description ? { description: value.description } : {}),
  };
}

export function actionValueZod(value: ActionValueDefinition, query = false): string {
  let schema: string;
  switch (value.type) {
    case 'OBJECT':
      schema = `z.object({${(value.properties ?? []).map((field) => `${JSON.stringify(field.name)}: ${actionValueZod(field.value, query)}${field.required === false ? '.optional()' : ''}`).join(',')}}).strict()`;
      break;
    case 'ARRAY':
      schema = `z.array(${actionValueZod(value.items!)}).min(${value.minItems ?? 0}).max(${value.maxItems ?? 1000})`;
      break;
    case 'INT':
      schema = `z.number().int().safe()${value.minimum !== undefined ? `.min(${value.minimum})` : ''}${value.maximum !== undefined ? `.max(${value.maximum})` : ''}`;
      if (query)
        schema = `z.preprocess(value => typeof value === 'string' && /^-?\\d+$/.test(value) ? Number(value) : value, ${schema})`;
      break;
    case 'BOOLEAN':
      schema = query
        ? `z.preprocess(value=>value==='true'?true:value==='false'?false:value,z.boolean())`
        : 'z.boolean()';
      break;
    case 'ENUM':
      schema = `z.enum(${JSON.stringify(value.enumValues)})`;
      break;
    case 'UUID':
      schema = 'z.uuid()';
      break;
    case 'DATE':
      schema = 'z.iso.date()';
      break;
    case 'DATETIME':
      schema = 'z.iso.datetime()';
      break;
    case 'DECIMAL':
      schema =
        "z.string().regex(/^-?\\d{1,10}(\\.\\d{1,2})?$/, 'Indique un decimal exacto con hasta dos posiciones.')";
      break;
    default:
      schema = `z.string().min(${value.minLength ?? 0}).max(${value.maxLength ?? 10000})`;
  }
  return schema + (value.nullable ? '.nullable()' : '');
}
export const actionTypeName = (operationId: string, part: 'Body' | 'Query' | 'Response') =>
  operationId[0]!.toUpperCase() + operationId.slice(1) + part;
export const actionSchemaName = (operationId: string, part: 'Body' | 'Query' | 'Response') =>
  operationId + part + 'Schema';
