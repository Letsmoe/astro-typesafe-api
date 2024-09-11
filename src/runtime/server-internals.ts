import type { APIRoute } from "astro";
import { encode, decode } from "es-codec";
import {
	AcceptHeaderMissing,
	UnsupportedClient,
	InputNotDeserializable,
	OutputNotSerializable,
} from "../errors.ts";
import { paramsToData } from "./param-codec.ts";
import { APIError, type TypesafeAPIContext } from "./server.ts";

export function createApiRoute(
	fetch: (input: unknown, content: TypesafeAPIContext) => unknown
): APIRoute {
	return async function (ctx) {
		const { request } = ctx;
		const { method, headers, url } = request;
		const contentType = headers.get("Content-Type");
		const accept = headers.get("Accept");
		// Check if an accept header is present
		if (accept === null) {
			throw new AcceptHeaderMissing(request);
		}
		// Make sure the client can accept the response format
		if (
			accept.includes("application/escodec") === false &&
			accept.includes("application/json") === false &&
			accept.includes("*/*") === false
		) {
			throw new UnsupportedClient(request);
		}

		let input: any;
		if (method === "GET") {
			const { searchParams } = new URL(url);
			input = Object.fromEntries(searchParams.entries());
			input = paramsToData(input);
		} else if (contentType === "application/json") {
			try {
				input = await request.json();
			} catch (error) {
				throw new InputNotDeserializable(error, url);
			}
		} else if (contentType === "application/escodec") {
			try {
				input = decode(await request.arrayBuffer());
			} catch (error) {
				throw new InputNotDeserializable(error, url);
			}
		} else if (contentType?.startsWith("multipart/form-data")) {
			input = await request.formData();
		} else {
			// Since we don't want to just block any request that comes through with a non-natively supported content-type
			// We will just let it slip using the request data as an array buffer and the dev will have to parse it manually.
			input = await request.arrayBuffer()
		};

		const response = {
			status: 200,
			statusText: "OK",
			headers: new Headers(),
		};

		Object.defineProperty(response, "headers", {
			value: response.headers,
			enumerable: true,
			writable: false,
		});

		const context: TypesafeAPIContext = Object.assign(ctx, { response });

		let output: any;
		try {
			output = await fetch(input, context);
		} catch (error: any) {
			if (error instanceof APIError) {
				return new Response(
					JSON.stringify({
						status: error.status,
						cause: error.cause,
						details: error.details,
						message: error.message,
					}),
					{
						status: error.status,
						headers: { "Content-Type": "application/json" },
						statusText: error.message,
					}
				);
			}

			return new Response(
				JSON.stringify({
					cause: error.cause,
					status: 500,
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
					statusText: "Internal Server Error",
				}
			);
		}

		let outputBody;
		if (accept.includes("application/json") || accept.includes("*/*")) {
			try {
				outputBody = JSON.stringify(output);
			} catch (error) {
				throw new OutputNotSerializable(error, url);
			}
			response.headers.set("Content-Type", "application/json");
		} else if (accept.includes("application/escodec")) {
			try {
				outputBody = encode(output);
			} catch (error) {
				throw new OutputNotSerializable(error, url);
			}
			response.headers.set("Content-Type", "application/escodec");
		}

		return new Response(outputBody, response);
	};
}
