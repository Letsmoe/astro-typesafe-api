import type { z } from "zod";

import type { TypesafeAPIHandler } from "./runtime/server.ts";

export type MappedClient<T> = MapAny<
    T,
    TypesafeAPITypeError<"The types for the client have not been generated yet. Try running `npm exec astro sync`.">
>

/*─────────────────────────────────────────────────────────────*
 *                    UTILITY TYPES
 *─────────────────────────────────────────────────────────────*/

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
 *
 * @deprecated
 */
export interface Options<OptionalHeaders extends Record<string, z.ZodSchema>>
  extends Omit<RequestInit, "body" | "method" | "headers"> {
  headers?: (Record<keyof OptionalHeaders, z.infer<OptionalHeaders[keyof OptionalHeaders]>> & HeadersInit);
}

/**
 * The base options for the fetch functions.
 */
export interface InputOptions<Input = undefined, OptionalHeaders extends Record<string, z.ZodSchema> = Record<string, z.ZodSchema>>
  extends Omit<RequestInit, "body" | "method" | "headers"> {
  headers?: (Record<keyof OptionalHeaders, z.infer<OptionalHeaders[keyof OptionalHeaders]>> & HeadersInit);
  body: Input;
  params?: Record<string, string>;
}

/**
 * Options extended to require a `params` property when the route has parameters.
 *
 * @deprecated
 */
interface OptionsWithParams<OptionalHeaders extends Record<string, z.ZodSchema>, Params extends string>
  extends Options<OptionalHeaders> {
    params: Record<Params, string>;
}

/**
 * Options extended to require a `params` property when the route has parameters.
 */
export interface InputOptionsWithParams<Input = undefined, OptionalHeaders extends Record<string, z.ZodSchema> = Record<string, z.ZodSchema>, Params extends string = string>
  extends InputOptions<Input, OptionalHeaders> {
    params: Record<Params, string>;
}

/**
 * A fetch interface that conditionally requires a `params` property based on the endpoint.
 */
export type Fetch_<
  Input,
  Output,
  OptionalHeaders extends Record<string, z.ZodSchema>,
  Params extends string,
  _InputOptions = IsNever<Params> extends true
    ? InputOptions<Input, OptionalHeaders>
    : InputOptionsWithParams<Input, OptionalHeaders, Params>,
  _Options = IsNever<Params> extends true
    ? Options<OptionalHeaders>
    : OptionsWithParams<OptionalHeaders, Params>
> = {
  (input: _InputOptions, context: ClientOptions & {
    processResponse: null;
  }): Promise<Response>;

  <T>(input: _InputOptions, context: ClientOptions & {
    processResponse: (response: Response) => Promise<T>;
  }): Promise<T>;

  (input: _InputOptions, context?: ClientOptions): Promise<Output>;

  /**
   * Shorthand for `(..., { processResponse: null })`
   *
   * @param input
   */
  raw(input: _InputOptions): Promise<Response>;

  /**
   * @deprecated
   * @param input
   * @param options
   */
  fetch(input: Input, options?: _Options): Promise<Response>;
  /**
   * @deprecated
   * @param input
   * @param options
   */
  fetchRaw(input: Input, options?: _Options): Promise<Response>;
} & (
  [undefined] | [any] extends [Input]
    ? {
      (input?: Partial<_InputOptions>, context?: ClientOptions): Promise<Output>;
      /**
       * Shorthand for `(..., { processResponse: null })`
       *
       * @param input
       */
      raw(input?: _InputOptions): Promise<Response>;
    }
    : {}
);

export interface ClientInputOptions<T = undefined> extends Omit<RequestInit, 'body'> {
	params?: Record<string, string>;
	body: T;
}

export interface ClientOptions {
  callServer?: ((
    segments: string[],
    method: string,
    inputOptions?: ClientInputOptions
  ) => Promise<Response>);

  /**
   * Set to `null` to disable response processing
   */
  processResponse?: null | (<T>(
    response: Response
  ) => Promise<T>);

  /**
   * Base path segments, w/o separators
   * @default [`api`]
   */
  basePath?: string[];
}

/*─────────────────────────────────────────────────────────────*
 *                    ROUTER TYPES
 *─────────────────────────────────────────────────────────────*/

/**
 * For a given route, convert its endpoint string and module into an object type.
 *
 * The module is “wrapped” in a proxy that converts each exported uppercase
 * method (which should be a typed API handler) into a fetch interface.
 * The extracted parameters from the endpoint string are passed along.
 */
export type Route<Endpoint extends string, EndpointModule> =
  EndpointToObject<Endpoint, ModuleProxy<EndpointModule, ExtractParams<Endpoint>>>;

/**
 * Wrap each export from the endpoint module so that:
 * - Only keys whose names are uppercase are allowed.
 * - They are transformed via MethodProxy.
 *
 * The extracted parameter names (if any) are passed as `Params`.
 */
type ModuleProxy<
  EndpointModule,
  Params extends string,
  ValidMethods extends keyof EndpointModule = {
    [Method in keyof EndpointModule]: Method extends string
      ? Method extends Uppercase<Method>
        ? Method
      : never
    : never
  }[keyof EndpointModule]
> = {
  [Method in ValidMethods]:
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
type MethodProxy<MethodExport, _Method extends string, Params extends string> =
  MethodExport extends TypesafeAPIHandler<any, any, infer OptionalHeaders, any, infer Input, infer Output>
    ? Fetch_<
      Input,
      Output,
      OptionalHeaders,
      Params
    >
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
