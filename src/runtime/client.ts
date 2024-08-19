import { proxyTarget, proxyHandler } from "./client-internals.ts"
import type { TypesafeAPITypeError, MapAny } from "../types.ts"

export const api: Client = new Proxy(proxyTarget, proxyHandler) as any

type Client = MapAny<
    // @ts-ignore this doesn't exist until .astro/astro-typesafe-api.d.ts is generated
    TypesafeAPI.Client,
    TypesafeAPITypeError<"The types for the client have not been generated yet. Try running `npm exec astro sync`.">
>
