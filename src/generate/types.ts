import { join } from "path";

export interface SelfResolvedEndpoints {
	entrypoint: string;
	pattern: string;
}

export const virtual = {
	server: "astro-typesafe:server",
	client: "astro-typesafe:client",
	api: "astro-typesafe:api",
};

export function referenceTypes(modulesDir: string, types: string, root: string) {
	return `/// <reference path="${join(root, types).replaceAll("\\", "/")}" />`;
}

export function getRouteTypes(roots: string[], routes: SelfResolvedEndpoints[], isVirtual?: boolean): string {
	const rootedRoutes = getRootedRoutes(roots, routes);

	return /* ts */`type Route<E extends string, M> = import("astro-typesafe-api/types").Route<E, M>;
type MappedClient<T> = import("astro-typesafe-api/types").MappedClient<T>;

declare namespace TypesafeAPI {${roots.map(root => `
	interface ${typename(root)}RawClient extends
		${rootedRoutes[root]
			.map(route => {
				const { endpoint, filename } = resolveRoute(route);

				return `Route<"${endpoint}", typeof import("${filename}")>`;
			})
			.join(",\n		")} {}
	type ${typename(root)}Client = MappedClient<${typename(root)}RawClient>;`).join("\n  ")}
}
${isVirtual ? /* ts */`
declare module "${virtual.server}" {${roots.map(root => `
	/**
	 * Call your ${root} handlers directly from the server
	 */
	export const ${varname(root)}: (astro: AstroGlobal) => TypesafeAPI.${typename(root)}Client;`).join("\n  ")}
}

declare module "${virtual.client}" {${roots.map(root => `
	/**
	 * Call your ${root} endpoints directly from the client
	 */
	export const ${varname(root)}: TypesafeAPI.${typename(root)}Client;`).join("\n  ")}
}

declare module "${virtual.api}" {
	export * from "astro-typesafe-api/server";
}
` : ``}`;
}

export function getServerRouteMap(roots: string[], routes: SelfResolvedEndpoints[], generic?: boolean) {
	const rootedRoutes = getRootedRoutes(roots, routes);

	return `import { createCallerFactory } from "astro-typesafe-api/server";

${roots.map(root => `export const ${varname(root)} = createCallerFactory${generic ? `<TypesafeAPI.${typename(root)}Client>` : ""}({
${rootedRoutes[root].map(route => {
		const { endpoint, filename } = resolveRoute(route);
		return `  "${root}/${endpoint}": await import("${filename}"),`;
	}).join("\n")}
}, ["${root}"]);
`).join("\n")}`;
}

export function getClientRouteMap(roots: string[], generic?: boolean): string {
	return `import { createClient } from "astro-typesafe-api/client";
${roots.map(root => `export const ${varname(root)} = createClient${generic ? `<TypesafeAPI.${typename(root)}Client>` : ""}({ basePath: ["${root}"] });`
	).join("\n")}
`;
}

function resolveRoute(route: SelfResolvedEndpoints) {
	const endpoint = (
		route.pattern
			.split("/")
			.slice(1)
			.join("/")
	);
	const filename = (
		(route.entrypoint)
			.replaceAll("\\", "/")
	);
	return { endpoint, filename };
}

function typename(root: string) {
	return root === "api" ? "" : varname(root);
}

function varname(root: string) {
	return camelCase(root.replace(/(\[|\.{3}|\])/g, "_"));
}

function camelCase(name: string, delim = "-") {
	const pattern = new RegExp((delim + "([a-z])"), "g");
	return name.replace(pattern, (_, capture) => capture.toUpperCase());
}

function getRootedRoutes(roots: string[], routes: SelfResolvedEndpoints[]) {
	const rootedRoutes: Record<string, SelfResolvedEndpoints[]> = {};

	for (const root of roots) {
		rootedRoutes[root] = routes.filter(r => r.pattern.startsWith(root));
	}
	return rootedRoutes;
}
