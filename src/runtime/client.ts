import { proxyHandler, defaultClientOptions, createProxyTarget } from "./client-internals.ts"
import type { TypesafeAPITypeError, MapAny, Fetch_, ClientOptions } from "../types.ts"

export const createClient = (options: ClientOptions = defaultClientOptions) => {
    const {
        callServer = defaultClientOptions.callServer,
        processResponse = defaultClientOptions.processResponse,
    } = options;

    return new Proxy(
        createProxyTarget(),
        proxyHandler({
            callServer,
            processResponse
        })
    ) as unknown as Client;
}

export const api = createClient();
export type API = Client;

export type inferOutput<Route extends Fetch_<any, any, any, any>> = Awaited<ReturnType<Route["fetch"]>>

type Client = MapAny<
    // @ts-ignore this doesn't exist until .astro/astro-typesafe/api.d.ts is generated
    TypesafeAPI.Client,
    TypesafeAPITypeError<"The types for the client have not been generated yet. Try running `npm exec astro sync`.">
>
