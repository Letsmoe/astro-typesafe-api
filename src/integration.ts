import type { AstroIntegration } from "astro";
import { addVirtualImports } from "astro-integration-kit";
import { globby } from "globby";
import path from "node:path";
import url from "node:url";

export type Options = {
	apiDir?: string;
	// https://github.com/withastro/astro/issues/12689
	// generateSchema?: boolean | Partial<SchemaGeneratorOptions>;
};

const virtualServerName = "astro-typesafe:server";
const virtualClientName = "astro-typesafe:client";
const virtualApiName = "astro-typesafe:api";
const declarationFile = "api.d.ts";

export default function (options?: Options): AstroIntegration {
	let apiDir: URL;
	let apiPath: string;
	let codegenPath: string;

	return {
		name: "astro-typesafe-api",
		hooks: {
			async "astro:config:setup"(params) {
				const { updateConfig, config, createCodegenDir } = params;
				codegenPath = url.fileURLToPath(createCodegenDir());

				apiDir = new URL(options?.apiDir ?? "pages/api", config.srcDir);
				apiPath = url.fileURLToPath(apiDir);

				const filenames = await globby(
					"**/*.{ts,mts}",
					{ cwd: apiDir }
				);

				updateConfig({
					vite: {
						optimizeDeps: {
							exclude: ["astro-typesafe-api"],
						},
						define: {
							"import.meta.env._TRAILING_SLASH": JSON.stringify(
								config.trailingSlash
							),
						},
						ssr: {
							// this package is published as uncompiled typescript, which we need vite to process
							noExternal: ["astro-typesafe-api"],
						},
					},
				});

				addVirtualImports(params, {
          name: "astro-typesafe-api",
          imports: {
						[virtualApiName]: `export * from "astro-typesafe-api/server";`,
						[virtualClientName]: `export * from "astro-typesafe-api/client";`,
            [virtualServerName]: getRouteMap(
							filenames,
							apiPath
						),
          }
        });
			},
			async "astro:config:done"({ injectTypes, logger }) {
				const filenames = await globby(
					"**/*.{ts,mts}",
					{ cwd: apiDir }
				);

				injectTypes({
					filename: declarationFile,
					content: getRouteTypes(
						filenames,
						codegenPath,
						apiPath
					)
				});

				logger.info("Updated astro types");

				// TODO: vite fails while running this,
				// see https://github.com/withastro/astro/issues/12689
				//
				// if (options?.generateSchema) {
				// 	return generateSchema({
				// 		url: config.site ?? "http://localhost",

				// 		title: `${config.site}`,
				// 		version: "1.0.0",
				// 		output: "./openapi.json",
				// 		...(
				// 			typeof options.generateSchema === 'boolean'
				// 				? {}
				// 				: options.generateSchema
				// 		)
				// 	});
				// } else {
				logger.info("Run 'astro-typesafe-api generate' to create an OpenAPI document.");
				// }
			},
		},
	};
}

function getRouteTypes(filenames: string[], codegenPath: string, apiPath: string): string {
	return `type Route<E extends string, M> = import("astro-typesafe-api/types").Route<E, M>

declare namespace TypesafeAPI {
	interface Client extends
		${filenames.map(filename => {
		const endpoint = filename.replace(/(\/index)?\.m?ts$/, "");

		// Generate relative path to make it independent of the user's tscofing options
		const specifier = path
			.relative(codegenPath, path.join(apiPath, filename))
			.replaceAll("\\", "/");

		return `Route<${JSON.stringify(endpoint)}, typeof import(${JSON.stringify(specifier)})>`;
	}).join(",\n		")}
	{}
}

declare module "${virtualServerName}" {
	/**
	 * Call your api handlers directly from the server
	 */
	export const api: (astro: AstroGlobal) => TypesafeAPI.Client;
}

declare module "${virtualClientName}" {
	/**
	 * Call your api handlers directly from the client
	 */
	export const api: TypesafeAPI.Client;
}

declare module "${virtualApiName}" {
	export * from "astro-typesafe-api/server";
}
`;
}

function getRouteMap(filenames: string[], apiPath: string) {
	return `import { createCallerFactory } from "astro-typesafe-api/server";\n\nexport const api = createCallerFactory({\n${
		filenames.map(filename => {
			const endpoint = filename.replace(/(\/index)?\.m?ts$/, "");
			const specifier = [apiPath, filename].join("/").replaceAll("\\", "/");
			return `	${JSON.stringify(endpoint)}: await import(${JSON.stringify(specifier)}),`;
		}).join("\n")
	}\n});`;
}
