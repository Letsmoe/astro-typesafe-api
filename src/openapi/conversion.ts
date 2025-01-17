import type { OpenAPIV3 } from "openapi-types";
import { z, type ZodTypeAny } from "zod";

export function zodToOpenAPISchema(schema: z.ZodTypeAny): OpenAPIV3.SchemaObject {
  const typeName = schema._def.typeName;

  if (typeName === 'ZodObject') {
    const shape = schema._def.shape();
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(shape).map(([key, value]) => [key, zodToOpenAPISchema(value as ZodTypeAny)])
      ),
      required: Object.keys(shape).filter((key) => !shape[key].isOptional()),
    };
  }

  if (typeName === 'ZodString') {
    return { type: 'string' };
  }

  if (typeName === 'ZodNumber') {
    return { type: 'number' };
  }

  if (typeName === 'ZodBoolean') {
    return { type: 'boolean' };
  }

  if (typeName === 'ZodArray') {
    return {
      type: 'array',
      items: zodToOpenAPISchema(schema._def.type),
    };
  }

  if (typeName === 'ZodUnion') {
    return {
      oneOf: schema._def.options.map((option: any) => zodToOpenAPISchema(option)),
    };
  }

  // if (typeName === 'ZodLiteral') {
  //   return {
  //     "const": schema._def.value,
  //   };
  // }

  if (typeName === 'ZodNullable') {
    return {
      nullable: true,
      ...zodToOpenAPISchema(schema._def.innerType),
    };
  }

  // Fallback for unsupported types
  return {};
}
