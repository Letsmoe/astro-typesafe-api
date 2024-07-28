import { ZodNotInstalled, InvalidSchema, InputValidationFailed, OutputValidationFailed, ProcedureFailed } from "../errors.ts"
import { createApiRoute } from "./server-internals.ts"
import type { APIContext, AstroGlobal } from "astro"
import { z, ZodSchema } from "zod"

export interface TypedAPIContext extends APIContext, Pick<AstroGlobal, "response"> {}

export interface TypedAPIHandler<Input, Output> {
    fetch(input: Input, context: TypedAPIContext): Promise<Output> | Output,
		input?: Input,
		output?: Output
}

// this particular overload has some song and dance to make sure type information does not get lost somewhere, be careful when changing it
//export function defineApiRoute<Handler extends TypedAPIHandler<unknown, unknown>>(handler: Handler): APIRoute & Handler
export function defineApiRoute<InputSchema extends ZodSchema, OutputSchema extends ZodSchema>(handler: {
	fetch: (input: z.infer<InputSchema>, context: TypedAPIContext) => Promise<z.infer<OutputSchema>> | z.infer<OutputSchema> | never;
	input?: InputSchema;
	output?: OutputSchema;
}) {
	return Object.assign(createApiRoute(async (input: any, context: TypedAPIContext) => {
		let zod: typeof import("zod") | undefined;

		try {
			zod = await import("zod");
		} catch {
			throw new ZodNotInstalled();
		}

		if ("input" in handler) {
			// NOTE: Doesn't work for some reason
			if (handler.input instanceof zod.ZodVoid) {
				if (input !== undefined) {
					throw new InputValidationFailed(new Error("Input was not expected."), context.request.url);
				}
			} else {
				if (handler.input instanceof zod.ZodType === false) {
					throw new InvalidSchema(handler.input);
				}

				try {
					input = handler.input.parse(input);
				} catch (error) {
					throw new InputValidationFailed(error, context.request.url);
				}
			}
		}

		let output: any;
		try { 
			output = await handler.fetch(input, context);
		} catch(e: any) {
			throw new ProcedureFailed(e.message, context.request.url);
		}

		if ("output" in handler) {
			if (handler.output instanceof zod.ZodType === false) {
				throw new InvalidSchema(handler.output);
			}

			try {
				return handler.output.parse(output);
			} catch (error) {
				throw new OutputValidationFailed(error, context.request.url);
			}
		}

		return output;
	}), handler);
}