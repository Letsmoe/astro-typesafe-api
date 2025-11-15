import { execSync } from "child_process";

import type { SchemaGeneratorOptions } from "./generate-schema";

export function runGenerateSchema(resolvedOptions: SchemaGeneratorOptions) {
	execSync(`astro-typesafe-api generate -o "${
		resolvedOptions.output
	}" -t "${
		resolvedOptions.title
	}" -v "${
		resolvedOptions.version
	}" ${resolvedOptions.description ? `-d "${
		resolvedOptions.description
	}"` : ""} -u "${
		resolvedOptions.url
	}"`)
}