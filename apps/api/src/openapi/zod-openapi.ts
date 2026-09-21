import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { apiErrorResponseSchema } from '@caseflow-ai/contracts';
import { z } from 'zod';

// The zod contracts in @caseflow-ai/contracts are the single source of truth for
// both runtime validation and the OpenAPI document. Nothing here re-declares a
// validation rule.

export function toOpenApiSchema(
  schema: z.ZodType,
  io: 'input' | 'output' = 'output',
): SchemaObject {
  const jsonSchema = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema as SchemaObject;
}

const uuidSchema = toOpenApiSchema(z.uuid(), 'input');

export function ApiUuidParam(name: string, description: string): MethodDecorator {
  return ApiParam({ name, description, required: true, schema: uuidSchema });
}

export function ApiZodBody(schema: z.ZodType): MethodDecorator {
  return ApiBody({ required: true, schema: toOpenApiSchema(schema, 'input') });
}

// Declares one query parameter per property of a zod object contract.
export function ApiZodQuery(schema: z.ZodObject): MethodDecorator {
  const jsonSchema = toOpenApiSchema(schema, 'input');
  const required = new Set(jsonSchema.required ?? []);
  const properties = (jsonSchema.properties ?? {}) as Record<string, SchemaObject>;
  return applyDecorators(
    ...Object.entries(properties).map(([name, property]) =>
      ApiQuery({ name, required: required.has(name), schema: property }),
    ),
  );
}

export function ApiZodResponse(
  status: number,
  description: string,
  schema: z.ZodType,
): MethodDecorator {
  return ApiResponse({ status, description, schema: toOpenApiSchema(schema, 'output') });
}

export function ApiErrorResponse(status: number, description: string): MethodDecorator {
  return ApiResponse({ status, description, schema: toOpenApiSchema(apiErrorResponseSchema) });
}
