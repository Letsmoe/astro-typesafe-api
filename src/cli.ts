#!/usr/bin/env bun

import * as Commander from "commander";

import { generateSchema } from "./generate-schema";

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
	.option("-u, --url",
		"The url of your server",
		"http://localhost"
	)
	.action(generateSchema);

Commander.program.parse();
