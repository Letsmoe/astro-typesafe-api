import type { APIContext, AstroGlobal } from "astro";
import type { IncomingHttpHeaders } from "node:http";
import { type ZodType, z } from "zod";

import {
	InputValidationFailed,
	InvalidHeaderEncountered,
	OutputValidationFailed,
	ZodNotInstalled,
} from "../errors.ts";
import { createClient, type API } from "./client.ts";
import type { OpenAPIMeta } from "./openapi.ts";
import { createApiRoute } from "./server-internals.ts";
import { defaultClientOptions } from "./client-internals.ts";

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
	InputSchema extends ZodType<Input>,
	OutputSchema extends ZodType<Output>,
	OptionalHeaders extends ZodValidatedIncomingHttpHeaders,
	Middleware extends TypesafeAPIMiddleware<Input>,
	Input,
	Output,
> = {
	input?: InputSchema;
	output?: OutputSchema;
	meta?: OpenAPIMeta;
	headers?: OptionalHeaders;
	fetch(
		input: Input,
		context: TypesafeAPIContextWithRequest<ZodValidatedIncomingHttpHeaders>,
		transfer: Awaited<ReturnType<Middleware>>
	): Promise<Output> | Output;
	middleware?: Middleware
}

export type TypesafeAPIMiddleware<Input> = (input: Input, context: TypesafeAPIContextWithRequest<ZodValidatedIncomingHttpHeaders>) => Promise<any>;

export function defineApiRoute<
	InputSchema extends ZodType<Input>,
	OutputSchema extends ZodType<Output>,
	OptionalHeaders extends ZodValidatedIncomingHttpHeaders,
	Middleware extends TypesafeAPIMiddleware<Input>,
	Input,
	Output,
>(
	handler: TypesafeAPIHandler<InputSchema, OutputSchema, OptionalHeaders, Middleware, Input, Output>
): TypesafeAPIHandler<InputSchema, OutputSchema, OptionalHeaders, Middleware, Input, Output> {
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
						context.request.headers.set(key, String(parsed));
					} catch {
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
export function createCallerFactory<Client = API>(routes: Record<string, any>, basePath: string[] = defaultClientOptions.basePath) {
	return (astro: AstroGlobal) => {
		return createClient<Client>({
			async callServer(segments, method, options) {
				const path = segments.map(segment => {
					if (segment.startsWith("_")) {
						return `[${segment.slice(1, segment.length)}]`
					}

					return segment
				}).join("/")

				const module = routes[path];

				if (!module?.[method]) {
					throw new Error(`'${path}' not callable with method ${method}`)
				}

				const endpoint = module[method] as TypesafeAPIHandler<any,any,any,any,any,any>;

				const request = new Request(new URL("http://127.0.0.1"), {
					headers: new Headers(options?.headers)
				})

				astro.params = options?.params || {};

				const ctx = Object.assign(astro, {
					request
				}) as unknown as TypesafeAPIContextWithRequest<ZodValidatedIncomingHttpHeaders>;

				let transfer = null;
				if ("middleware" in endpoint) {
					try {
						transfer = await endpoint.middleware(options?.body, ctx)
					} catch(e) {
						let error: string = e as string;
						if (e instanceof APIError) {
							error = e.message
						}

						throw new Error(`'${path}' middleware threw '${error}', please be aware that some request parameters might not be available in a server-side caller context or that they need to be provided manually.`)
					}
				}

				try {
					return await endpoint.fetch(options?.body, ctx, transfer);
				} catch(e) {
					let error: string = e as string;
					if (e instanceof APIError) {
						error = e.message
					}

					throw new Error(`'${path}' endpoint threw '${error}', please be aware that some request parameters might not be available in a server-side caller context or that they need to be provided manually.`)
				}
			},
			processResponse: null,
			basePath
		});
	}
}