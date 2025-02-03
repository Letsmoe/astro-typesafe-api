#!/usr/bin/env bun

import * as Commander from "commander";
import * as fs from "fs"
import * as path from "path"
import { promisify } from "util";
import { OpenAPIV3 } from "openapi-types";
import type { OpenAPIMeta } from "./runtime/openapi";
import type { defineApiRoute } from "./runtime/server";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodSchema } from "zod";
import inquirer from "inquirer"

const restRequestMethods  = ["GET", "ALL", "POST", "DELETE", "PUT", "PATCH"]

Commander.program
	.command("generate")
	.option(
		"-o, --output",
		"The output file path for the generated content.",
		"./openapi.json"
	)
	.option("-t, --title",
		"The title for the OpenAPI Document",
		"Title"
	)
	.option("-v, --version",
		"The version for the OpenAPI Document",
		"1.0.0"
	)
	.option("-d, --description",
		"The description for the OpenAPI Document",
		""
	)
	.action(async (options) => {
		// Find all the api route files
		const root = path.join(process.cwd(), "./src/pages/api")
		const routes = await recursiveReaddir(root)

		const { url } = await inquirer.prompt([{
			name: "url",
			message: "What's your server's URL?",
			type: "input",
			default: "http://localhost"
		}])

		const openApiDoc: OpenAPIV3.Document = {
			openapi: "3.0.3",
			info: {
				title: options.title,
				version: options.version,
				description: options.description
			},
			paths: {},
			servers: [{
				url,
			}]
		}
		
		for (const route of routes) {
			const module = await import(route);
			
			for (const method of restRequestMethods) {
				if (!module.hasOwnProperty(method)) {
					continue;
				}

				const requestMethod = module[method] as Parameters<typeof defineApiRoute>[0];

				const meta = requestMethod.meta || {} as OpenAPIMeta;

				// replace astro's url parameter syntax with openapi's parameter syntax
				let name = route.replace(root, "").replaceAll(/\[(.*?)\]/g, "{$1}")
				// remove the extension
				name = name.slice(0, -path.extname(name).length)

				if (path.parse(name).name === "index") {
					// remove index name
					name = name.slice(0, -5)
				}
				

				// @ts-ignore
				openApiDoc.paths[name] = {} as Record<keyof OpenAPIV3.PathItemObject, OpenAPIV3.OperationObject>;

				// @ts-ignore
				openApiDoc.paths[name][method.toLowerCase() as keyof OpenAPIV3.PathItemObject] = {
					description: meta.description,
					tags: meta.tags,
					requestBody: requestMethod.input ? {
						required: true,
						content: (meta.contentTypes || ["application/json"]).reduce((acc, c) => {
							acc[c] = {
								schema: zodToJsonSchema(requestMethod.input as ZodSchema, {
									target: "openApi3"
								})
							}

							return acc;
						}, {} as Record<string, any>)
					} : undefined,
					parameters: Array.from(name.matchAll(/\{(.*?)\}/g)).map((match) => {
						return {
							name: match[1],
							in: "path",
							required: true,
							schema: {
								type: "string"
							}
						} as OpenAPIV3.ParameterObject
					}).concat(Object.entries(requestMethod.headers || {}).map(([name, value]) => {
						return {
							name,
							schema: zodToJsonSchema(value, {
								target: "openApi3"
							}),
							description: value.description,
							required: !value.isOptional(),
							in: "header"
						} as OpenAPIV3.ParameterObject
					})),
					responses: {
						200: {
							description: "Successful response",
							content: {
								"application/json": {
									schema: requestMethod.output ? zodToJsonSchema(requestMethod.output, {
										target: "openApi3"
									}) : {}
								}
							}
						}
					}
				} as OpenAPIV3.OperationObject
			}
		}

		fs.writeFileSync(options.output, JSON.stringify(openApiDoc))
	});

	const recursiveReaddir = async (dir: string): Promise<string[]> => {
		const subdirs = await promisify(fs.readdir)(dir)
		const files = await Promise.all(subdirs.map(async (subdir) => {
			const res = path.resolve(dir, subdir)
			return (await promisify(fs.stat)(res)).isDirectory() ? recursiveReaddir(res) : res;
		}))

		return files.reduce((a: string[], f: string | string[]) => a.concat(f), [])
	}


Commander.program.parse()