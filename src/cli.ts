#!/usr/bin/env bun

import { join } from "path";

import { build } from "astro";
import * as Commander from "commander";
import { writeFile } from "fs/promises";
import { readFile } from "fs/promises";

Commander.program
	.command("generate")
	.description(`
Do not use this if you're already outputting a schema as a part of your astro build!
Simply \`cp ./dist/client/openapi.json ./your/desired/folder\` after the build instead!
	`)
	.option(
		"-o, --output <FILE>",
		"The output file path for the generated content.",
		"./openapi.json"
	)
	.option("-t, --title <TITLE>",
		"The title for the OpenAPI Document",
		"Title"
	)
	.option("-v, --version <VERSION>",
		"The version for the OpenAPI Document",
		"1.0.0"
	)
	.option("-d, --description <DESC>",
		"The description for the OpenAPI Document",
		""
	)
	.option("-u, --url <URL>",
		"The url of your server",
		"/"
	)
	.option("-i, --input <GLOB>",
		"The glob pattern to filter input endpoints from src/pages",
		"**/[!{_}]*.{ts,mts}"
	)
	.action(async params => {
		await build({
			integrations: [(await import("./integration")).default({
				endpointsGlob: params.input,
				generateSchema: {
					title: params.title,
					description: params.description,
					version: params.version,
					servers: [{ url: params.url ?? "/" }],
				},
			})]
		}, {
			devOutput: false,
			teardownCompiler: true,
		});

		await writeFile(
			params.output,
			await readFile(join(process.cwd(), 'dist/client/openapi.json'))
		);
	});

Commander.program.parse();