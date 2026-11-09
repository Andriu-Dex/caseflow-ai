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
    mimeTypes: z
      .array(z.enum(['application/pdf', 'image/png', 'image/jpeg', 'text/csv']))
      .min(1)
      .max(4)
      .optional(),
  })
  .strict();

function boundedValue(depth: number): z.ZodType<ActionValueDefinition> {
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
                  value: boundedValue(depth - 1),
                })
                .strict(),
            )
            .max(50)
            .optional(),
          items: boundedValue(depth - 1).optional(),
        })
        .strict()
    : base;
  return schema.superRefine((value, ctx) => {
    const item = value as ActionValueDefinition;
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
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
}

export const actionValueDefinitionSchema = boundedValue(4);
export const implementationActionContractSchema = z
  .object({
    bindings: z
      .array(
        z.discriminatedUnion('kind', [
          z
            .object({
              kind: z.literal('ACTION'),
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
      .object({ routePath: z.string().max(200), idField: z.string().regex(/^[a-z][a-zA-Z0-9]*$/) })
      .strict()
      .optional(),
    body: actionValueDefinitionSchema.optional(),
    query: actionValueDefinitionSchema.optional(),
    response: actionValueDefinitionSchema,
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
