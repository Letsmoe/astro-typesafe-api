import type { OpenAPIV3 } from "openapi-types";

import type { SelfResolvedEndpoints } from "./types";

const restRequestMethods  = ["GET", "ALL", "POST", "DELETE", "PUT", "PATCH"];

export interface SchemaGeneratorOptions {
	/**
	 * The document title
	 */
	title: string;
	/**
	 * Version of the document/api
	 */
	version: string;
	/**
	 * Custom document description
	 */
	description?: string;
	/**
	 * Custom server urls
	 */
	servers: OpenAPIV3.ServerObject[];

	/**
	 * Whether the document should be generated at build-time as a virtual route
	 *
	 * `false` - will make the document generate into the `pages` directory as a real endpoint
	 *
	 * @default true
	 */
	virtual?: boolean;

	/**
	 * Whether the document should be prerendered at build-time into a static JSON file
	 *
	 * `false` - will instead create an endpoint that generates the document at run-time on each request
	 *
	 * @default true
	 */
	prerender?: boolean;

	/**
	 * Custom response options, useful mostly only if `prerender: false` is set
	 */
	response?: ResponseInit;

	/**
	 * URL of the endpoint that will serve the schema document
	 *
	 * @default `/openapi.json`
	 */
	url?: string;
}

export const schemaFileName = 'openapi.json.ts';

export function generateSchemaEndpoint(routes: SelfResolvedEndpoints[], options: SchemaGeneratorOptions) {
	const openApiDoc: OpenAPIV3.Document = {
		openapi: "3.0.3",
		info: {
			title: options.title,
			version: options.version,
			description: options.description,
		},
		paths: {},
		servers: options.servers,
	};

	return /* ts */`import type { OpenAPIMeta } from "astro-typesafe-api/openapi";
import type { defineApiRoute } from "astro-typesafe-api/server";
import { toJSONSchema } from "zod";

const openApiDoc = ${JSON.stringify(openApiDoc)};
const methods = ${JSON.stringify(restRequestMethods)};${
	typeof options.prerender === 'boolean'
	? `\nexport const prerender = ${!!options.prerender};`
	: ''
}

export async function GET() {
	return new Response(JSON.stringify({
		...openApiDoc,
		paths: {
			${routes.map(route => {
				// replace astro's url parameter syntax with openapi's parameter syntax
				const pattern = JSON.stringify(
					route.pattern.replace(/\[\.{3}?(.*?)\]/g, "{$1}")
				);
				return `${pattern}: getDocForRoute(await import(${JSON.stringify(
					// Astro needs the imports to be static in order to resolve virtual modules in them
					route.entrypoint
				)}), ${pattern}),`;
			}).join("\n")}
		}
	}), ${JSON.stringify({
		status: 200,
		headers: {
			"Content-Type": "application/json",
		},
		...options.response
	})});
}

function getDocForRoute(module: Promise<Record<string, any>>, pattern: string) {
	return methods.reduce((obj, method) => {
		if (!(method in module)) {
			return obj;
		}

		const requestMethod = module[method] as Parameters<typeof defineApiRoute>[0];

		const meta = requestMethod.meta || {} as OpenAPIMeta;

		const requestBody = method !== "GET" && requestMethod.input ? {
			required: true,
			content: (meta.contentTypes || ["application/json"]).reduce((acc, c) => {
				acc[c] = {
					schema: toJSONSchema(requestMethod.input!, {
						target: "openapi-3.0"
					})
				};

				return acc;
			}, {} as Record<string, any>)
		} : undefined;
		${/* TODO: handle input for query parameters */``}
		const parameters = Array.from(pattern.matchAll(/\\{(.*?)\\}/g)).map((match) => {
			return {
				name: match[1].replace(/^\\.{3}/, ''),
				in: "path",
				required: true,
				schema: {
					type: "string"
				}
			};
		}).concat(Object.entries(requestMethod.headers || {}).map(([name, value]) => {
			return {
				name,
				schema: toJSONSchema(value, {
					target: "openapi-3.0"
				}),
				description: value.description,
				required: !value.isOptional(),
				in: "header"
			} as any;
		}));

		return {
			...obj,
			[method.toLowerCase()]: {
				description: meta.description,
				tags: meta.tags,
				requestBody,
				parameters,
				responses: {
					200: {
						description: "Successful response",
						content: {
							"application/json": {
								schema: requestMethod.output ? toJSONSchema(requestMethod.output, {
									target: "openapi-3.0"
								}) : {}
							}
						}
					}
				}
			},
		};
	}, {});
}`;
}
