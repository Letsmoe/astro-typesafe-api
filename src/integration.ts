import fs from "node:fs";
import url from "node:url";
import path from "node:path";
import { globby } from "globby";
import type {
	AstroIntegration,
	AstroConfig,
} from "astro";

export interface Options {
	generateOpenAPIDocument?: boolean;
	openAPIDocumentPath?: string;
	// TODO: let user define api wherever
}

const packagePathPrefix = '.astro/integrations/astro-typesafe-api';
const packageFileUrl = (config: AstroConfig, name: string) => new URL(`${packagePathPrefix}/${name}`, config.root);

export default function (_?: Partial<Options>): AstroIntegration {
	const declarationFile = "api.d.ts";
	const routeMapFile = "caller.ts";
	let apiDir: URL;
	let declarationFileUrl: URL;
	let routeMapFileUrl: URL;
	return {
		name: "astro-typesafe-api",
		hooks: {
			async "astro:config:setup"({ updateConfig, config }) {
				apiDir = new URL("pages/api", config.srcDir);
				declarationFileUrl = packageFileUrl(config, declarationFile);
				routeMapFileUrl = packageFileUrl(config, routeMapFile);

				updateConfig({
					vite: {
						optimizeDeps: {
							exclude: ["astro-typesafe-api"],
						},
						plugins: [
							{
								name: "astro-typesafe-api/typegen",
								enforce: "post",
								async config() {
									const filenames = await globby(
										"**/*.{ts,mts}",
										{ cwd: apiDir }
									);
									generateTypesAndRouteMap(
										filenames,
										apiDir,
										declarationFileUrl,
										routeMapFileUrl
									);
								},
							},
						],
					},
				});

				updateConfig({
					vite: {
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
			},
			"astro:config:done"({ injectTypes, logger }) {
				injectTypes({
					filename: declarationFile,
					content: ""
				});

				logger.info("Updated astro types");
				logger.info("Run 'astro-typesafe-api generate' to create an OpenAPI document.");
			},
			"astro:server:setup"({ server }) {
				server.watcher.on("add", async (path) => {
					if (
						path.includes("pages/api") ||
						path.includes("pages\\api")
					) {
						const filenames = await globby("**/*.{ts,mts}", {
							cwd: apiDir,
						});
						generateTypesAndRouteMap(filenames, apiDir, declarationFileUrl, routeMapFileUrl);
					}
				});
			},
		},
	};
}

async function generateTypesAndRouteMap(
	filenames: string[],
	apiDir: URL,
	declarationFileUrl: URL,
	routeMapFileUrl: URL
) {
	const dotAstroPath = path.dirname(url.fileURLToPath(declarationFileUrl));
	const apiPath = url.fileURLToPath(apiDir);

	fs.mkdirSync(path.dirname(url.fileURLToPath(declarationFileUrl)), {
		recursive: true,
	});

	let declaration = `
type Route<E extends string, M> = import("astro-typesafe-api/types").Route<E, M>

declare namespace TypesafeAPI {
	interface Client extends
		${filenames.map(filename => {
			const endpoint = filename.replace(/(\/index)?\.m?ts$/, "");
			const specifier = path
				.relative(dotAstroPath, path.join(apiPath, filename))
				.replaceAll("\\", "/");

			return `Route<${JSON.stringify(endpoint)}, typeof import(${JSON.stringify(specifier)})>`;
		}).join(',\n		')}
	{}
}
	`;
	fs.writeFileSync(declarationFileUrl, declaration);


	/* -------------------------- Write the route map -------------------------- */

	let routeMap = `import { createCallerFactory } from "astro-typesafe-api/server";\n\nexport const createCaller = createCallerFactory({\n${filenames.map(filename => {
		const endpoint = filename.replace(/(\/index)?\.m?ts$/, "");
		const specifier = path
			.relative(dotAstroPath, path.join(apiPath, filename))
			.replaceAll("\\", "/");
		return `    ${JSON.stringify(endpoint)}: await import(${JSON.stringify(specifier)}),`;
	}).join("\n")}\n})`

	fs.writeFileSync(routeMapFileUrl, routeMap)
}
