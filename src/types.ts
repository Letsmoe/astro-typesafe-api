import type { z } from "zod";
import type { TypesafeAPIHandler } from "./runtime/server.ts";

/*─────────────────────────────────────────────────────────────*
 *                    UTILITY TYPES
 *─────────────────────────────────────────────────────────────*/

// Convert a union to an intersection.
type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void)
    ? I
    : never;

// Check if a type is `never`.
type IsNever<T> = [T] extends [never] ? true : false;

export interface TypesafeAPITypeError<Message> {
  error: Message;
}

/*─────────────────────────────────────────────────────────────*
 *                    PARAM EXTRACTION
 *─────────────────────────────────────────────────────────────*/

/**
 * Extracts a union of parameter names from an endpoint string.
 *
 * Examples:
 *   - "[id]"             → "id"
 *   - "foo/[id]"         → "id"
 *   - "[...slug]"        → "slug"
 *   - "foo/[id]/bar/[x]"  → "id" | "x"
 */
type ExtractParams<Endpoint extends string> =
  Endpoint extends `[...${infer Param}]` ? Param :
  Endpoint extends `[${infer Param}]/${infer Rest}` ? Param | ExtractParams<Rest> :
  Endpoint extends `${infer _}/${infer Rest}` ? ExtractParams<Rest> :
  Endpoint extends `[${infer Param}]` ? Param : never;

/*─────────────────────────────────────────────────────────────*
 *                    FETCH FUNCTION TYPES
 *─────────────────────────────────────────────────────────────*/

/**
 * The base options for the fetch functions.
 */
export interface Options<OptionalHeaders extends Record<string, z.ZodSchema>>
  extends Omit<RequestInit, "body" | "method" | "headers"> {
  headers?: (Record<keyof OptionalHeaders, z.infer<OptionalHeaders[keyof OptionalHeaders]>> & HeadersInit);
}

/**
 * Options extended to require a `params` property when the route has parameters.
 */
interface OptionsWithParams<OptionalHeaders extends Record<string, z.ZodSchema>, Params extends string>
  extends Options<OptionalHeaders> {
    params: Record<Params, string>;
}

/**
 * A fetch interface that conditionally requires a `params` property based on the endpoint.
 */
export type Fetch_<Input, Output, OptionalHeaders extends Record<string, z.ZodSchema>, Params extends string> =
  IsNever<Params> extends true
    ? {
        fetch(input: Input, options?: Options<OptionalHeaders>): Promise<Output>;
        fetchRaw(input: Input, options?: Options<OptionalHeaders>): Promise<Response>;
      }
    : {
        fetch(input: Input, options: OptionsWithParams<OptionalHeaders, Params>): Promise<Output>;
        fetchRaw(input: Input, options: OptionsWithParams<OptionalHeaders, Params>): Promise<Response>;
      };

/*─────────────────────────────────────────────────────────────*
 *                    ROUTER TYPES
 *─────────────────────────────────────────────────────────────*/

/**
 * Builds a router from a tuple of routes.
 * Each tuple element is of the form `[EndpointString, EndpointModule]`.
 *
 * We map over the tuple to produce a union of route objects and then convert that
 * union to an intersection.
 */
export type CreateRouter<Routes extends [string, unknown][]> =
  UnionToIntersection<
    {
      [K in keyof Routes]: Routes[K] extends [infer Endpoint extends string, infer Module]
        ? Route<Endpoint, Module>
        : never;
    }[number]
  >;

/**
 * For a given route, convert its endpoint string and module into an object type.
 *
 * The module is “wrapped” in a proxy that converts each exported uppercase
 * method (which should be a typed API handler) into a fetch interface.
 * The extracted parameters from the endpoint string are passed along.
 */
type Route<Endpoint extends string, EndpointModule> =
  EndpointToObject<Endpoint, ModuleProxy<EndpointModule, ExtractParams<Endpoint>>>;

/**
 * Wrap each export from the endpoint module so that:
 * - Only keys whose names are uppercase are allowed.
 * - They are transformed via MethodProxy.
 *
 * The extracted parameter names (if any) are passed as `Params`.
 */
type ModuleProxy<EndpointModule, Params extends string> = {
  [Method in keyof EndpointModule]:
    Method extends string
      ? Method extends Uppercase<Method>
        ? MethodProxy<EndpointModule[Method], Method, Params>
        : TypesafeAPITypeError<"API route methods must be uppercase.">
      : TypesafeAPITypeError<"API route methods must be strings.">
};

/**
 * Convert a method’s export (which should be a TypesafeAPIHandler) into a Fetch interface.
 * The `Params` type is passed to determine whether the fetch interface should require parameters.
 */
type MethodProxy<MethodExport, Method extends string, Params extends string> =
  MethodExport extends TypesafeAPIHandler<infer Input, infer Output, infer OptionalHeaders, any>
    ? Fetch_<z.infer<Input>, z.infer<Output>, OptionalHeaders, Params>
    : TypesafeAPITypeError<"Export is not a typed handler. Use `defineApiRoute`">;

/**
 * Parse the endpoint string into an object type.
 *
 * The following patterns are supported:
 * - `[...param]` → produces a key of the form `_"param"_`
 * - `[param]`   → produces a key of the form `_"param"`
 * - A literal segment → produces a key with that segment name
 *
 * Nested segments create nested objects.
 */
type EndpointToObject<Endpoint extends string, T> =
  Endpoint extends `[...${infer Param}]`
    ? { [K in `_${Param}_`]: T }
    : Endpoint extends `${infer Head}/${infer Tail}`
    ? Head extends `[${infer Param}]`
      ? { [K in `_${Param}`]: EndpointToObject<Tail, T> }
      : { [K in Head]: EndpointToObject<Tail, T> }
    : Endpoint extends `[${infer Param}]`
    ? { [K in `_${Param}`]: T }
    : { [K in Endpoint]: T };


export type MapAny<T, IfAny> = (T extends never ? true : false) extends false ? T : IfAny

