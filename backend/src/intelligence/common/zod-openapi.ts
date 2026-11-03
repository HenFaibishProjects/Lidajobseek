import type { ApiResponseOptions } from '@nestjs/swagger';
import { z } from 'zod';

// @nestjs/swagger does not export SchemaObject from its package entry point.
type SchemaObject = Extract<ApiResponseOptions, { schema: unknown }>['schema'];

/**
 * Converts a Zod schema to an OpenAPI 3.0 schema so docs share one source of truth
 * with validation. Use `io: 'input'` for request bodies so defaulted fields are optional.
 */
export function toOpenApiSchema(
  schema: z.ZodType,
  io: 'input' | 'output' = 'output',
): SchemaObject {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
    // Dates are serialized to JSON as ISO strings.
    override: (ctx) => {
      if (ctx.zodSchema._zod.def.type === 'date') {
        ctx.jsonSchema.type = 'string';
        ctx.jsonSchema.format = 'date-time';
      }
    },
  }) as SchemaObject;
}
