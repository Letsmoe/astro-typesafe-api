import type { ClientOptions, Fetch_, MappedClient } from "../types.ts"
import { createProxyTarget, defaultClientOptions, proxyHandler } from "./client-internals.ts"

export const createClient = <Client = API>(
    options: ClientOptions = defaultClientOptions
) => {
    const {
        callServer = defaultClientOptions.callServer,
        processResponse = defaultClientOptions.processResponse,
        basePath = defaultClientOptions.basePath
    } = options;

    return new Proxy(
        createProxyTarget(basePath),
        proxyHandler({
            callServer,
            processResponse,
            basePath: basePath
        })
    ) as unknown as Client;
}

export const api = createClient();

/// <reference path=".astro/types.d.ts" />
// @ts-ignore this doesn't exist until .astro/astro-typesafe/api.d.ts is generated
export type API = MappedClient<TypesafeAPI.Client>;

export type inferOutput<Route extends Fetch_<any, any, any, any>> = Awaited<ReturnType<Route["fetch"]>>
