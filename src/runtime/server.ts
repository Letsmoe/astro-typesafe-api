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


type ZodValidatedIncomingHttpHeaders = Record<
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
export interface TypesafeAPIHandler<
	InputSchema extends ZodSchema,
	OutputSchema extends ZodSchema,
	OptionalHeaders extends ZodValidatedIncomingHttpHeaders
> {
	input?: InputSchema;
	output?: OutputSchema;
	meta?: OpenAPIMeta;
	headers?: OptionalHeaders;
	fetch(
		input: z.infer<InputSchema>,
		context: Omit<TypesafeAPIContext, "request"> & {
			request: Omit<Pick<AstroGlobal, "request">, "headers"> & {
				headers: ZodValidatedHeaderProvider<
					keyof OptionalHeaders,
					z.infer<OptionalHeaders[keyof OptionalHeaders]>
				>;
			};
		}
	): Promise<z.infer<OutputSchema>> | z.infer<OutputSchema>;
}

// this particular overload has some song and dance to make sure type information does not get lost somewhere, be careful when changing it
//export function defineApiRoute<Handler extends TypesafeAPIHandler<unknown, unknown>>(handler: Handler): APIRoute & Handler
export function defineApiRoute<
	InputSchema extends ZodSchema,
	OutputSchema extends ZodSchema,
	OptionalHeaders extends ZodValidatedIncomingHttpHeaders
>(
	handler: TypesafeAPIHandler<InputSchema, OutputSchema, OptionalHeaders>
): TypesafeAPIHandler<InputSchema, OutputSchema, OptionalHeaders> {
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
						input = handler.input.parse(input);
					} catch (error) {
						throw new InputValidationFailed(
							error,
							context.request.url
						);
					}
				}
			}

			const output = await handler.fetch(input, context);

			if ("output" in handler) {
				// if (handler.output instanceof zod.ZodSchema === false) {
				// 	throw new InvalidSchema(handler.output);
				// }

				try {
					return handler.output.parse(output);
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
