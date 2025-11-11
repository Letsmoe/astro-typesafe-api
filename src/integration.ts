import fs from "node:fs";
import url from "node:url";
import path from "node:path";
import { globby } from "globby";
import type {
	AstroIntegration,
	AstroConfig,
	AstroIntegrationLogger,
} from "astro";
export interface Options {
	generateOpenAPIDocument?: boolean;
	openAPIDocumentPath?: string;
}

const packagePathPrefix = '.astro/astro-typesafe-api';
const packageFileUrl = (config: AstroConfig, name: string) => new URL(`${packagePathPrefix}/${name}`, config.root);

export default function (_?: Partial<Options>): AstroIntegration {
	let apiDir: URL;
	let declarationFileUrl: URL;
	let routeMapFileUrl: URL;
	return {
		name: "astro-typesafe-api",
		hooks: {
			async "astro:config:setup"({ updateConfig, config, logger }) {
				apiDir = new URL("pages/api", config.srcDir);
				declarationFileUrl = packageFileUrl(config, "api.d.ts");
				routeMapFileUrl = packageFileUrl(config, "caller.ts");

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
									injectEnvDTS(
										config,
										logger,
										declarationFileUrl
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
	let declaration = ``;
	declaration += `type CreateRouter<Routes> = import("astro-typesafe-api/types").CreateRouter<Routes>\n`;
	declaration += `\n`;
	declaration += `declare namespace TypesafeAPI {\n`;
	declaration += `    interface Client extends CreateRouter<[\n`;
	for (const filename of filenames) {
		const endpoint = filename.replace(/(\/index)?\.m?ts$/, "");
		const specifier = path
			.relative(dotAstroPath, path.join(apiPath, filename))
			.replaceAll("\\", "/");
		declaration += `    `;
		declaration += `    [${JSON.stringify(
			endpoint
		)}, typeof import(${JSON.stringify(specifier)})],\n`;
	}
	declaration += `    ]> {}\n`;
	declaration += `}\n`;
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

function injectEnvDTS(
	config: AstroConfig,
	logger: AstroIntegrationLogger,
	specifier: URL | string
) {
	const envDTsPath = url.fileURLToPath(packageFileUrl(config, "env.d.ts"));

	if (specifier instanceof URL) {
		specifier = url.fileURLToPath(specifier);
		specifier = path.relative(url.fileURLToPath(config.srcDir), specifier);
		specifier = specifier.replaceAll("\\", "/");
	}

	let envDTsContents = fs.readFileSync(envDTsPath, "utf8");

	if (envDTsContents.includes(`/// <reference types='${specifier}' />`)) {
		return;
	}
	if (envDTsContents.includes(`/// <reference types="${specifier}" />`)) {
		return;
	}

	const newEnvDTsContents = envDTsContents
		.replace(
			`/// <reference types='astro/client' />`,
			`/// <reference types='astro/client' />\n/// <reference types='${specifier}' />\n`
		)
		.replace(
			`/// <reference types="astro/client" />`,
			`/// <reference types="astro/client" />\n/// <reference types="${specifier}" />\n`
		);

	// the odd case where the user changed the reference to astro/client
	if (newEnvDTsContents === envDTsContents) {
		return;
	}

	fs.writeFileSync(envDTsPath, newEnvDTsContents);
	logger.info("Updated env.d.ts types");
	logger.info("Run 'astro-typesafe-api generate' to create an OpenAPI document.");
}
