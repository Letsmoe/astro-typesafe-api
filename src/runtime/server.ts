import {
	ZodNotInstalled,
	InputValidationFailed,
	OutputValidationFailed,
	InvalidHeaderEncountered,
} from "../errors.ts";
import type { OpenAPIMeta } from "./openapi.ts";
import { createApiRoute } from "./server-internals.ts";
import type { APIContext, AstroGlobal } from "astro";
import { z, ZodSchema } from "zod";
import type { IncomingHttpHeaders } from "node:http";
import type { MapAny, TypesafeAPITypeError } from "../types.ts";


export type ZodValidatedIncomingHttpHeaders = Record<
	keyof IncomingHttpHeaders,
	z.ZodSchema
>;

/**
 * Provides a typesafe way to access headers that have been validated by zod.
 * A layer on top of the Headers interface.
 *
 * @interface ZodValidatedHeaderProvider
 * @typedef {ZodValidatedHeaderProvider}
 * @template ValidatedHeaderName
 * @template {string} ValidatedReturnType
 * @extends {Headers}
 */
interface ZodValidatedHeaderProvider<ValidatedHeaderName, ValidatedReturnType>
	extends Omit<Headers, "get"> {
	get<Key extends ValidatedHeaderName>(
		key: Key
	): ValidatedReturnType;
	get(key: string): string | null;
}

export interface TypesafeAPIContext
	extends APIContext,
		Pick<AstroGlobal, "response"> {}

export type TypesafeAPIContextWithRequest<OptionalHeaders extends ZodValidatedIncomingHttpHeaders> = Omit<TypesafeAPIContext, "request"> & {
	request: Omit<Pick<AstroGlobal, "request">, "headers"> & {
		headers: ZodValidatedHeaderProvider<
			keyof OptionalHeaders,
			z.infer<OptionalHeaders[keyof OptionalHeaders]>
		>;
	};
}

export type TypesafeAPIHandler<
	InputSchema extends ZodSchema,
	OutputSchema extends ZodSchema,
	OptionalHeaders extends ZodValidatedIncomingHttpHeaders,
	Middleware extends TypesafeAPIMiddleware<InputSchema>
> = {
	input?: InputSchema;
	output?: OutputSchema;
	meta?: OpenAPIMeta;
	headers?: OptionalHeaders;
	fetch(
		input: z.infer<InputSchema>,
		context: TypesafeAPIContextWithRequest<ZodValidatedIncomingHttpHeaders>,
		transfer: Awaited<ReturnType<Middleware>>
	): Promise<z.infer<OutputSchema>> | z.infer<OutputSchema>;
	middleware?: Middleware
}

export type TypesafeAPIMiddleware<InputSchema extends ZodSchema> = (input: z.infer<InputSchema>, context: TypesafeAPIContextWithRequest<ZodValidatedIncomingHttpHeaders>) => Promise<any>;

export function defineApiRoute<
	InputSchema extends ZodSchema,
	OutputSchema extends ZodSchema,
	OptionalHeaders extends ZodValidatedIncomingHttpHeaders,
	Middleware extends TypesafeAPIMiddleware<InputSchema>
>(
	handler: TypesafeAPIHandler<InputSchema, OutputSchema, OptionalHeaders, Middleware>
): TypesafeAPIHandler<InputSchema, OutputSchema, OptionalHeaders, Middleware> {
	return Object.assign(
		createApiRoute(async (input: any, context: TypesafeAPIContext) => {
			let zod: typeof import("zod") | undefined;

			try {
				zod = await import("zod");
			} catch {
				throw new ZodNotInstalled();
			}

			if (handler.headers) {
				// Validate headers
				for (const [key, schema] of Object.entries(handler.headers)) {
					const value = context.request.headers.get(key);
					if (value === null) {
						throw new InvalidHeaderEncountered(
							`Header '${key}' is missing.`,
							context.request.url
						);
					}

					try {
						const parsed = schema.parse(value);
						context.request.headers.set(key, parsed);
					} catch (error) {
						throw new InvalidHeaderEncountered(
							`Header '${key}' is invalid.`,
							context.request.url
						);
					}
				}
			}

			if ("input" in handler) {
				// NOTE: Doesn't work for some reason
				if (handler.input instanceof zod.ZodVoid) {
					if (input !== undefined) {
						throw new InputValidationFailed(
							new Error("Input was not expected."),
							context.request.url
						);
					}
				} else {
					// if (handler.input instanceof zod.ZodSchema === false) {
					// 	throw new InvalidSchema(handler.input);
					// }

					try {
						input = handler.input?.parse(input);
					} catch (error) {
						throw new InputValidationFailed(
							error,
							context.request.url
						);
					}
				}
			}

			let transfer = null;
			if (typeof handler.middleware === "function") {
				transfer = await handler.middleware(input, context as unknown as TypesafeAPIContextWithRequest<ZodValidatedIncomingHttpHeaders>)
			}

			const output = await handler.fetch(input, context as unknown as TypesafeAPIContextWithRequest<ZodValidatedIncomingHttpHeaders>, transfer);

			if ("output" in handler) {
				// if (handler.output instanceof zod.ZodSchema === false) {
				// 	throw new InvalidSchema(handler.output);
				// }

				try {
					return handler.output?.parse(output);
				} catch (error) {
					throw new OutputValidationFailed(
						error,
						context.request.url
					);
				}
			}

			return output;
		}),
		handler
	);
}

export class APIError {
	public status: number;
	public code: string;
	public message: string;
	public details?: unknown;
	public cause?: unknown;
	constructor(_: {
		code:
			| "BAD_REQUEST"
			| "UNAUTHORIZED"
			| "FORBIDDEN"
			| "NOT_FOUND"
			| "METHOD_NOT_SUPPORTED"
			| "TIMEOUT"
			| "CONFLICT"
			| "PRECONDITION_FAILED"
			| "PAYLOAD_TOO_LARGE"
			| "UNSUPPORTED_MEDIA_TYPE"
			| "UNPROCESSABLE_CONTENT"
			| "TOO_MANY_REQUESTS"
			| "CLIENT_CLOSED_REQUEST"
			| "INTERNAL_SERVER_ERROR"
			| "NOT_IMPLEMENTED"
			| "BAD_GATEWAY"
			| "SERVICE_UNAVAILABLE"
			| "GATEWAY_TIMEOUT";
		message: string;
		details?: unknown;
		cause?: unknown;
	}) {
		this.code = _.code;
		this.status = this.getHttpCode();
		this.message = _.message;
		this.details = _.details;
		this.cause = _.cause;
	}

	private getHttpCode() {
		switch (this.code) {
			case "BAD_REQUEST":
				return 400;
			case "UNAUTHORIZED":
				return 401;
			case "FORBIDDEN":
				return 403;
			case "NOT_FOUND":
				return 404;
			case "METHOD_NOT_SUPPORTED":
				return 405;
			case "TIMEOUT":
				return 408;
			case "CONFLICT":
				return 409;
			case "PRECONDITION_FAILED":
				return 412;
			case "PAYLOAD_TOO_LARGE":
				return 413;
			case "UNSUPPORTED_MEDIA_TYPE":
				return 415;
			case "UNPROCESSABLE_CONTENT":
				return 422;
			case "TOO_MANY_REQUESTS":
				return 429;
			case "CLIENT_CLOSED_REQUEST":
				return 499;
			case "INTERNAL_SERVER_ERROR":
				return 500;
			case "NOT_IMPLEMENTED":
				return 501;
			case "BAD_GATEWAY":
				return 502;
			case "SERVICE_UNAVAILABLE":
				return 503;
			case "GATEWAY_TIMEOUT":
				return 504;
			default:
				return 500;
		}
	}
}

/**
 * Create a virtual caller that will call the methods attached to API routes instead of fetching them.
 * @param context The context that will be provided with the request.
 */
export function createCallerFactory(routes: Record<string, any>) {
	return (astro: AstroGlobal) => {
		const proxyTarget = { TypesafeAPIEndpoint: new Array<string>() };
		const proxyHandler: ProxyHandler<typeof proxyTarget> = { get };
		
		interface Options extends RequestInit {
			params?: Record<string, string>;
		}
	
		function get(target: typeof proxyTarget, prop: string) {
			if (typeof prop === "symbol")
				throw new TypeError(
					`The typed API client cannot be keyed with ${String(prop)}.`
				);
			const { TypesafeAPIEndpoint } = target;
			if (prop === "fetch") {
				const method = TypesafeAPIEndpoint.pop()!;
				return async (input: any, options?: Options) => {
					let path = TypesafeAPIEndpoint.map(segment => {
						if (segment.startsWith("_")) {
							return `[${segment.slice(1, segment.length)}]`
						}
	
						return segment
					}).join("/")
	
					const module = routes[path];
	
					if (!(method in module)) {
						throw new Error(`'${path}' not callable with method ${method}`)
					}
					
	
					const endpoint = module[method] as TypesafeAPIHandler<any,any,any,any>;
	
					const request = new Request(new URL("http://127.0.0.1"), {
						headers: new Headers(options?.headers)
					})
	
					astro.params = options?.params || {};
	
					const ctx: TypesafeAPIContextWithRequest<ZodValidatedIncomingHttpHeaders> = Object.assign(astro, {
						request
					});
					
					let transfer = null;
					if ("middleware" in endpoint) {
						try {
							transfer = await endpoint.middleware(input, ctx)
						} catch(e) {
							let error: string = e as string;
							if (e instanceof APIError) {
								error = e.message
							}

							throw new Error(`'${path}' middleware threw '${error}', please be aware that some request parameters might not be available in a server-side caller context or that they need to be provided manually.`)
						}
					}
					
					try {
						return await endpoint.fetch(input, ctx, transfer);
					} catch(e) {
						let error: string = e as string;
						if (e instanceof APIError) {
							error = e.message
						}

						throw new Error(`'${path}' endpoint threw '${error}', please be aware that some request parameters might not be available in a server-side caller context or that they need to be provided manually.`)
					}
				};
			}
			return new Proxy(
				{ TypesafeAPIEndpoint: [...TypesafeAPIEndpoint, prop] },
				proxyHandler
			);
		}

		return new Proxy(proxyTarget, proxyHandler) as unknown as MapAny<
				// @ts-ignore this doesn't exist until .astro/astro-typesafe-api.d.ts is generated
				TypesafeAPI.Client,
				TypesafeAPITypeError<"The types for the client have not been generated yet. Try running `npm exec astro sync`.">
		>
	}
}