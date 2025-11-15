#!/usr/bin/env bun

import { join } from "path";

import * as Commander from "commander";
import { writeFile } from "fs/promises";
import { globby } from "globby";

import { generateSchema } from "./generate-schema";

Commander.program
	.command("generate")
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
	.action(async params => {
		const root = join(process.cwd(), "./src/pages").replaceAll("\\", "/");

		const routes = await globby("**/[!{_}]*.{ts,mts}", { cwd: root, absolute: true });

		const schema = await generateSchema(routes, root, params);

		await writeFile(params.output, JSON.stringify(schema));
	});

Commander.program.parse();