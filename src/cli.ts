#!/usr/bin/env bun

import * as Commander from "commander";
import * as fs from "fs"
import * as path from "path"
import { promisify } from "util";
import { OpenAPIV3 } from "openapi-types";
import type { OpenAPIMeta } from "./runtime/openapi";
import type { defineApiRoute } from "./runtime/server";
import { zodToOpenAPISchema } from "./openapi/conversion";

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

		const openApiDoc: OpenAPIV3.Document = {
			openapi: "3.0.3",
			info: {
				title: options.title,
				version: options.version,
				description: options.description
			},
			paths: {}
		}
		
		for (const route of routes) {
			const module = await import(route);
			
			for (const method of restRequestMethods) {
				if (!module.hasOwnProperty(method)) {
					continue;
				}

				const requestMethod = module[method] as Parameters<typeof defineApiRoute>[0];

				const meta = requestMethod.meta || {} as OpenAPIMeta;

				const name = path.parse(route.replace(root, "")).name

				// @ts-ignore
				openApiDoc.paths[name] = {} as Record<keyof OpenAPIV3.PathItemObject, OpenAPIV3.OperationObject>;

				// @ts-ignore
				openApiDoc.paths[name][method.toLowerCase() as keyof OpenAPIV3.PathItemObject] = {
					description: meta.description,
					tags: meta.tags,
					requestBody: requestMethod.input ? {
						required: true,
						content: {
							"application/json": {
								schema: zodToOpenAPISchema(requestMethod.input)
							}
						}
					} : undefined,
					responses: {
						200: {
							description: "Successful response",
							content: {
								"application/json": {
									schema: requestMethod.output ? zodToOpenAPISchema(requestMethod.output) : {}
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