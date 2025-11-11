import { encode, decode, type Serializable } from "es-codec";
import {
	MissingHTTPVerb,
	IncorrectHTTPVerb,
	ResponseNotOK,
	UnknownResponseFormat,
} from "../errors.ts";
import { dataToParams } from "./param-codec.ts";
import type { ClientOptions } from "../types.ts";

interface ProxyTarget {
	(): void;
	TypesafeAPIEndpoint: string[];
}

export const createProxyTarget = (target: string[] = []): ProxyTarget => {
	function proxyTarget() {}
	proxyTarget.TypesafeAPIEndpoint = target;

	return proxyTarget;
}

export const proxyHandler = (clientOptions: RequiredClientOptions): ProxyHandler<ProxyTarget> => {
	return {
		get: get(clientOptions),
		apply: apply(clientOptions),
	};
};

export const defaultClientOptions = {
    callServer,
    processResponse
} satisfies ClientOptions;

interface Options extends RequestInit {
	params?: Record<string, string>;
}

interface InputOptions<T = undefined> extends Omit<Options, 'body'> {
	body: T;
}

export type RequiredClientOptions = Required<ClientOptions>;

function apply(clientOptions: RequiredClientOptions) {
	return (async (target, _, [options, context]: [InputOptions?, ClientOptions?]) => {
		const { TypesafeAPIEndpoint } = target;
		const method = TypesafeAPIEndpoint.pop()!;
		const {
			callServer = clientOptions.callServer,
			processResponse = clientOptions.processResponse
		} = context || clientOptions;

		const response = await callServer(
			TypesafeAPIEndpoint,
			method,
			options
		);

		return await processResponse?.(response) ?? response;
	}) satisfies ProxyHandler<ProxyTarget>['apply'];
}

function get(clientOptions: RequiredClientOptions) {
	return ((target, prop) => {
		if (typeof prop !== "string")
			throw new TypeError(
				`The typed API client cannot be keyed with ${String(prop)}.`
			);
		const { TypesafeAPIEndpoint } = target;

		if (prop === "raw") {
			return async (options?: InputOptions) => apply({
				callServer: clientOptions.callServer,
				processResponse: null
			})(target, undefined, [options]);
		}

		if (prop === "fetch" /* deprecated */) {
			return (input: any, options?: Options) => apply(clientOptions)(target, undefined, [{
				...options,
				body: input
			}]);
		}

		if (prop === "fetchRaw" /* deprecated */) {
			return async (input: any, options?: Options) => apply({
				callServer: clientOptions.callServer,
				processResponse: null
			})(target, undefined, [{
				...options,
				body: input
			}]);
		}

		return new Proxy(
			createProxyTarget([...TypesafeAPIEndpoint, prop]),
			proxyHandler(clientOptions)
		);
	}) satisfies ProxyHandler<ProxyTarget>['apply'];
}

export async function callServer<T extends Serializable = undefined>(
	segments: string[],
	method_: string,
	options: InputOptions<T> = { body: undefined as T }
): Promise<Response> {
	const { origin } = location;
	let pathname_ = "/api";
	const { body: input, params } = options;
	nextSegment: for (const segment of segments) {
		if (typeof params === "object") {
			for (const paramName in params) {
				if (
					segment === `_${paramName}` ||
					segment === `_${paramName}_`
				) {
					const paramValue = params[paramName];
					pathname_ += "/" + paramValue;
					continue nextSegment;
				}
			}
		}
		pathname_ += "/" + segment;
	}
	if (import.meta.env.BASE_URL !== "/") {
		pathname_ = (import.meta.env.BASE_URL + pathname_)
			.split("/")
			.filter(Boolean)
			.join("/");
	}
	if (import.meta.env._TRAILING_SLASH === "always") {
		if (pathname_.endsWith("/") === false) pathname_ += "/";
	}
	const pathname = pathname_;
	const method = method_ === "ALL" ? options.method : method_;
	if (method === undefined) throw new MissingHTTPVerb(pathname);
	if (method !== method.toUpperCase())
		throw new IncorrectHTTPVerb(method, pathname);
	const isGET = method === "GET";
	const searchParams = isGET
		? "?" + String(new URLSearchParams(dataToParams(input)))
		: "";
	const url = new URL(pathname + searchParams, origin);
	const headers = new Headers(options.headers);
	headers.set("Accept", "application/escodec, application/json");
	if (isGET === false) {
		headers.set("Content-Type", "application/escodec");
	}
	const body = isGET ? undefined : encode(input);
	const response = await fetch(url, { ...options, method, body, headers });
	if (response.ok === false) {
		// Leave the original response intact to parse later
		throw new ResponseNotOK(response, await response.clone().text());
	}
	return response;
}

export async function processResponse(response: Response) {
	const contentType = response.headers.get("Content-Type");

	if (contentType === "application/escodec") {
		return decode(await response.arrayBuffer());
	}

	if (contentType !== "application/json") {
		throw new UnknownResponseFormat(response);
	}

	try {
		return await response.json();
	} catch {
		return null;
	}
}
