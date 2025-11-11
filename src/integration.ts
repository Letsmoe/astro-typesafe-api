import fs from "node:fs";
import url from "node:url";
import path from "node:path";
import { globby } from "globby";
import type {
	AstroIntegration,
} from "astro";

export interface Options {
	generateCallerFactory?: boolean;
	generateOpenAPIDocument?: boolean;
	openAPIDocumentPath?: string;
}

export default function (options?: Partial<Options>): AstroIntegration {
	const declarationFile = "api.d.ts";
	const routeMapFile = "pages/api/_caller.ts";

	let apiDir: URL;
	let declarationFileUrl: URL;
	let routeMapFileUrl: URL;

	let dotAstroPath: string;
	let apiPath: string;

	return {
		name: "astro-typesafe-api",
		hooks: {
			async "astro:config:setup"({ updateConfig, config }) {
				apiDir = new URL("pages/api", config.srcDir);
				declarationFileUrl = new URL(`${dotAstroPath}/${declarationFile}`, config.root);
				routeMapFileUrl = new URL(routeMapFile, config.srcDir);
				dotAstroPath = path.dirname(url.fileURLToPath(declarationFileUrl));
				apiPath = url.fileURLToPath(apiDir);

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

									fs.mkdirSync(dotAstroPath, {
										recursive: true,
									});

									generateTypes(
										filenames,
										dotAstroPath,
										apiPath,
										declarationFileUrl,
									);

									if (options?.generateCallerFactory) {
										generateRouteMap(
											filenames,
											dotAstroPath,
											apiPath,
											routeMapFileUrl,
										);
									}
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

						generateTypes(
							filenames,
							dotAstroPath,
							apiPath,
							routeMapFileUrl
						);
					}
				});
			},
		},
	};
}

async function generateRouteMap(
	filenames: string[],
	dotAstroPath: string,
	apiDir: string,
	routeMapFileUrl: URL,
) {

	let routeMap = `import { createCallerFactory } from "astro-typesafe-api/server";\n\nexport const createCaller = createCallerFactory({\n${filenames.map(filename => {
		const endpoint = filename.replace(/(\/index)?\.m?ts$/, "");
		const specifier = path
			.relative(dotAstroPath, path.join(apiDir, filename))
			.replaceAll("\\", "/");
		return `    ${JSON.stringify(endpoint)}: await import(${JSON.stringify(specifier)}),`;
	}).join("\n")}\n})`

	fs.writeFileSync(routeMapFileUrl, routeMap)
}
async function generateTypes(
	filenames: string[],
	dotAstroPath: string,
	apiDir: string,
	declarationFileUrl: URL
) {
	let declaration = `
type Route<E extends string, M> = import("astro-typesafe-api/types").Route<E, M>

declare namespace TypesafeAPI {
	interface Client extends
		${filenames.map(filename => {
			const endpoint = filename.replace(/(\/index)?\.m?ts$/, "");
			const specifier = path
				.relative(dotAstroPath, path.join(apiDir, filename))
				.replaceAll("\\", "/");

			return `Route<${JSON.stringify(endpoint)}, typeof import(${JSON.stringify(specifier)})>`;
		}).join(',\n		')}
	{}
}
	`;

	fs.writeFileSync(declarationFileUrl, declaration);
}
