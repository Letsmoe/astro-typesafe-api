import { proxyTarget, proxyHandler } from "./client-internals.ts"
import type { TypesafeAPITypeError, MapAny, Fetch_ } from "../types.ts"

export const api: Client = new Proxy(proxyTarget, proxyHandler) as any
export type API = Client;

export type inferOutput<Route extends Fetch_<any, any, any, any>> = Awaited<ReturnType<Route["fetch"]>>

type Client = MapAny<
    // @ts-ignore this doesn't exist until .astro/astro-typesafe/api.d.ts is generated
    TypesafeAPI.Client,
    TypesafeAPITypeError<"The types for the client have not been generated yet. Try running `npm exec astro sync`.">
>
