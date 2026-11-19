import { z } from 'zod';

export interface ActionValueDefinition {
  type:
    | 'STRING'
    | 'UUID'
    | 'DECIMAL'
    | 'INT'
    | 'BOOLEAN'
    | 'DATE'
    | 'DATETIME'
    | 'ENUM'
    | 'OBJECT'
    | 'ARRAY'
    | 'FILE';
  description?: string;
  referenceEntityLocalId?: string;
  technical?: boolean;
  nullable?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enumValues?: string[];
  properties?: { name: string; required?: boolean; value: ActionValueDefinition }[];
  items?: ActionValueDefinition;
  minItems?: number;
  maxItems?: number;
  maxBytes?: number;
  mimeTypes?: string[];
  collectionLayout?: 'CARDS' | 'TABLE';
  groupBy?: string;
}

const base = z
  .object({
    type: z.enum([
      'STRING',
      'UUID',
      'DECIMAL',
      'INT',
      'BOOLEAN',
      'DATE',
      'DATETIME',
      'ENUM',
      'OBJECT',
      'ARRAY',
      'FILE',
    ]),
    description: z.string().trim().min(1).max(1000).optional(),
    referenceEntityLocalId: z.string().min(1).max(100).optional(),
    technical: z.boolean().optional(),
    nullable: z.boolean().optional(),
    minLength: z.number().int().min(0).max(10000).optional(),
    maxLength: z.number().int().min(1).max(10000).optional(),
    minimum: z.number().int().safe().optional(),
    maximum: z.number().int().safe().optional(),
    enumValues: z.array(z.string().min(1).max(100)).min(1).max(50).optional(),
    minItems: z.number().int().min(0).max(1000).optional(),
    maxItems: z.number().int().min(1).max(1000).optional(),
    maxBytes: z.number().int().min(1).max(1_048_576).optional(),
    collectionLayout: z.enum(['CARDS', 'TABLE']).optional(),
    groupBy: z
      .string()
      .regex(/^[a-z][a-zA-Z0-9]*$/)
      .max(60)
      .optional(),
    mimeTypes: z
      .array(z.enum(['application/pdf', 'image/png', 'image/jpeg', 'text/csv']))
      .min(1)
      .max(4)
      .optional(),
  })
  .strict();

// The keys each value type can carry. A strict json_schema answer lists every
// key, and a model may fill one that its type cannot use (a table layout on a
// text, a length on an object) instead of leaving it null.
const KEYS_BY_TYPE: Record<string, readonly string[]> = {
  minLength: ['STRING'],
  maxLength: ['STRING'],
  minimum: ['INT'],
  maximum: ['INT'],
  enumValues: ['ENUM'],
  referenceEntityLocalId: ['UUID'],
  properties: ['OBJECT'],
  items: ['ARRAY'],
  minItems: ['ARRAY'],
  maxItems: ['ARRAY'],
  maxBytes: ['FILE'],
  mimeTypes: ['FILE'],
};
export function withoutInapplicableKeys(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const item = { ...(value as Record<string, unknown>) };
  const type = item.type;
  if (typeof type !== 'string') return value;
  for (const [key, types] of Object.entries(KEYS_BY_TYPE))
    if (!types.includes(type)) delete item[key];
  const items = item.items as { type?: unknown } | undefined;
  if (type !== 'ARRAY' || items?.type !== 'OBJECT') {
    delete item.collectionLayout;
    delete item.groupBy;
  }
  return item;
}

function boundedValue(depth: number, forAI = false): z.ZodType<ActionValueDefinition> {
  const schema = depth
    ? base
        .extend({
          properties: z
            .array(
              z
                .object({
                  name: z
                    .string()
                    .regex(/^[a-z][a-zA-Z0-9]*$/)
                    .max(60),
                  required: z.boolean().optional(),
                  value: boundedValue(depth - 1, forAI),
                })
                .strict(),
            )
            .max(50)
            .optional(),
          items: boundedValue(depth - 1, forAI).optional(),
        })
        .strict()
    : forAI
      ? // At the last level a list or an object has no room for its contents:
        // the AI is offered only the types that need none.
        base.extend({ type: base.shape.type.exclude(['OBJECT', 'ARRAY']) })
      : base;
  const refined = schema.superRefine((value, ctx) => {
    const item = value as ActionValueDefinition;
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (
      (item.collectionLayout || item.groupBy) &&
      (item.type !== 'ARRAY' || item.items?.type !== 'OBJECT')
    )
      fail('La presentación de colecciones requiere un arreglo de objetos.');
    if (item.groupBy) {
      const field = item.items?.properties?.find((property) => property.name === item.groupBy);
      if (
        !item.collectionLayout ||
        !field ||
        field.value.technical ||
        !['STRING', 'ENUM'].includes(field.value.type)
      )
        fail('La agrupación requiere una presentación y un campo de texto visible declarado.');
    }
    if (
      item.type === 'FILE' &&
      (!item.maxBytes || !item.mimeTypes || new Set(item.mimeTypes).size !== item.mimeTypes.length)
    )
      fail('Un archivo requiere tamaño máximo y tipos MIME únicos permitidos.');
    if (item.type !== 'FILE' && (item.maxBytes !== undefined || item.mimeTypes !== undefined))
      fail('Los límites de archivo requieren un archivo.');
    if (item.referenceEntityLocalId && item.type !== 'UUID')
      fail('Una referencia requiere un identificador UUID.');
    if (item.type === 'OBJECT' && !item.properties)
      fail('Un objeto requiere propiedades explícitas.');
    if (item.type === 'ARRAY' && !item.items)
      fail('Un arreglo requiere un contrato para sus elementos.');
    if (
      item.type === 'ENUM' &&
      (!item.enumValues || new Set(item.enumValues).size !== item.enumValues.length)
    )
      fail('Una enumeración requiere valores únicos.');
    if (
      item.properties &&
      (item.type !== 'OBJECT' ||
        new Set(item.properties.map((p) => p.name)).size !== item.properties.length)
    )
      fail('Las propiedades deben pertenecer a un objeto y tener nombres únicos.');
    if (item.items && item.type !== 'ARRAY') fail('Solo un arreglo puede declarar elementos.');
    if (item.enumValues && item.type !== 'ENUM')
      fail('Solo una enumeración puede declarar valores.');
    if ((item.minLength !== undefined || item.maxLength !== undefined) && item.type !== 'STRING')
      fail('Los límites de longitud requieren texto.');
    if ((item.minimum !== undefined || item.maximum !== undefined) && item.type !== 'INT')
      fail('Los límites numéricos requieren un entero.');
    if ((item.minItems !== undefined || item.maxItems !== undefined) && item.type !== 'ARRAY')
      fail('Los límites de elementos requieren un arreglo.');
    for (const [min, max] of [
      [item.minLength, item.maxLength],
      [item.minimum, item.maximum],
      [item.minItems, item.maxItems],
    ])
      if (min !== undefined && max !== undefined && min > max)
        fail('El límite mínimo no puede superar al máximo.');
  });
  return forAI
    ? (z.preprocess(
        withoutInapplicableKeys,
        refined,
      ) as unknown as z.ZodType<ActionValueDefinition>)
    : refined;
}

export const actionValueDefinitionSchema = boundedValue(4);
const actionContract = (valueDefinition: z.ZodType<ActionValueDefinition>) =>
  z
    .object({
      bindings: z
        .array(
          z.discriminatedUnion('kind', [
            z
              .object({
                kind: z.enum(['ACTION', 'PREFILL']),
                field: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
                sourceEndpoint: z.string().max(220),
                sourceField: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
                requireTrue: z
                  .string()
                  .regex(/^[a-z][a-zA-Z0-9]*$/)
                  .optional(),
              })
              .strict(),
            z
              .object({ kind: z.literal('UUID'), field: z.string().regex(/^[a-z][a-zA-Z0-9]*$/) })
              .strict(),
          ]),
        )
        .max(20)
        .optional(),
      successNavigation: z
        .object({
          routePath: z.string().max(200),
          idField: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
        })
        .strict()
        .optional(),
      body: valueDefinition.optional(),
      query: valueDefinition.optional(),
      response: valueDefinition,
    })
    .strict()
    .superRefine((contract, ctx) => {
      const bindings = contract.bindings ?? [];
      if (new Set(bindings.map((binding) => binding.field)).size !== bindings.length)
        ctx.addIssue({
          code: 'custom',
          message: 'Cada campo solo puede tener un enlace de entrada.',
          path: ['bindings'],
        });
      for (const binding of bindings) {
        const field = contract.body?.properties?.find((field) => field.name === binding.field);
        if (!field || (binding.kind === 'UUID' && field.value.type !== 'UUID'))
          ctx.addIssue({
            code: 'custom',
            message: 'El enlace debe coincidir con un campo de entrada.',
            path: ['bindings'],
          });
      }
      for (const key of ['body', 'query'] as const)
        if (contract[key] && (contract[key]!.type !== 'OBJECT' || contract[key]!.nullable))
          ctx.addIssue({
            code: 'custom',
            message: 'La entrada debe ser un objeto no nulo.',
            path: [key],
          });
      if (
        contract.query?.properties?.some(
          (field) => ['OBJECT', 'ARRAY', 'FILE'].includes(field.value.type) || field.value.nullable,
        )
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Los filtros de consulta deben ser valores escalares no nulos.',
          path: ['query'],
        });
    });
export const implementationActionContractSchema = actionContract(actionValueDefinitionSchema);
// Strict json_schema allows at most 10 levels of object nesting: inside an
// endpoint of a plan answer, four levels of values reach 12. What the AI is
// asked for is one level shallower; what it returns still validates against
// the canonical contract.
export const aiImplementationActionContractSchema = actionContract(boundedValue(3, true));
