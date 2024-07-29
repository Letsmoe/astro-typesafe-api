# Astro Typesafe API

<div width="100%" align="center">
    <img alt="GitHub" src="https://img.shields.io/github/license/Letsmoe/astro-typesafe-api?label=License">
    <img alt="GitHub issues" src="https://img.shields.io/github/issues/Letsmoe/astro-typesafe-api?label=Issues">
    <img alt="GitHub contributors" src="https://img.shields.io/github/contributors/Letsmoe/astro-typesafe-api?label=Contributors">
    <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/Letsmoe/astro-typesafe-api?label=Stars">
    <img alt="GitHub watchers" src="https://img.shields.io/github/watchers/Letsmoe/astro-typesafe-api?label=Watchers">
</div>



<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/Letsmoe/astro-typesafe-api">
    <img src="logo.png" alt="Logo" width="auto" height="400">
  </a>


  <p align="center">
    A typesafe API integration for Astro
    <br />
    <a href="https://github.com/Letsmoe/astro-typesafe-api/issues">Report Bug</a>
    ·
    <a href="https://github.com/Letsmoe/astro-typesafe-api/issues">Request Feature</a>
  </p>
</div>

>[!NOTE]
> This package is a fork of [astro-typed-api](https://socket.dev/npm/package/astro-typed-api) from [lilnasy's GitHub](https://github.com/lilnasy/gratelets). However, a lot of things were changed to make it suit to my needs and more versatile than the original package.

## Why astro-typesafe-api?

[Astro's API routes](https://docs.astro.build/en/core-concepts/endpoints) offer a powerful way to serve dynamic content. However, they operate independently of your front-end code. This means developers must handle data serialization and deserialization manually, with no guarantee that changes in API design won't disrupt UI functionality.

This integration addresses these issues by providing a type-safe api object that understands the input and return types of your API routes. Aligned with Astro's philosophy, it achieves this with minimal additional concepts to learn.

## Installation

### Manual Install

First, install the `astro-typesafe-api` package using your package manager. If you're using npm or aren't sure, run this in the terminal:

```sh
npm install astro-typesafe-api
```

Then, apply this integration to your `astro.config.*` file using the `integrations` property:

```diff lang="js" "astroTypesafeAPI()"
  // astro.config.mjs
  import { defineConfig } from 'astro/config';
+ import astroTypesafeAPI from 'astro-typesafe-api';

  export default defineConfig({
    // ...
    integrations: [astroTypesafeAPI()],
    //             ^^^^^^^^
  });
```

## Usage

Typed API routes are created using the `defineApiRoute()` function, which are then exported the same way that normal [API routes](https://docs.astro.build/en/core-concepts/endpoints) are in Astro.

```ts
// src/pages/api/hello.ts
import { defineApiRoute } from "astro-typesafe-api/server"
import { z } from "zod"

export const GET = defineApiRoute({
	fetch: (name: string) => `Hello, ${name}!`,
	input: z.string(),
	output: z.string()
)
```

The `defineApiRoute()` function takes an object with a `fetch` method. The `fetch` method will be called when an HTTP request is routed to the current endpoint. Parsing the request for structured data and converting the returned value to a response is handled automatically. Once defined, the API route becomes available for browser-side code to use on the `api` object exported from `astro-typesafe-api/client`:

```ts
---
// src/pages/index.astro
---
<script>
    import { api } from "astro-typesafe-api/client"

    const message = await api.hello.GET.fetch("Letsmoe")
    console.log(message) // "Hello, Letsmoe!"
</script>
```

When the `fetch` method is called on the browser, the arguments passed to it are serialized as query parameters and a `GET` HTTP request is made to the Astro server. The result is deserialized from the response and returned by the call.

Note that only endpoints within the `src/pages/api` directory are exposed on the `api` object. Additionally, the endpoints must all be typescript files. For example, `src/pages/x.ts` and `src/pages/api/x.js` will **not** be made available to `astro-typesafe-api/client`.

### Type-safety

Types for newly created endpoints are automatically added to the `api` object while `astro dev` is running. You can also run [`astro sync`](https://docs.astro.build/en/reference/cli-reference/#astro-sync) to update the types.

Typed API stores the generated types inside [`.astro` directory](https://docs.astro.build/en/guides/content-collections/#the-astro-directory) in the root of your project. The files here are automatically created, updated and used.

### Input and output validation.

If `defineApiRoute()` is provided with a [zod schema](https://docs.astro.build/en/guides/content-collections/#defining-datatypes-with-zod) as the `input` and `output` property, the input and output of the API route will be validated against the schema automatically.

```ts
// src/pages/api/validatedHello.ts
import { defineApiRoute } from "astro-typesafe-api/server"
import { z } from "zod"

export const GET = defineApiRoute({
	input: z.object({
		user: z.string(),
	}),
	output: z.string(),
	fetch: ({ user }) => `Hello, ${user}!`,
)
```

### Using middleware locals

The `fetch()` method is provided Astro's [APIContext](https://docs.astro.build/en/reference/api-reference/#endpoint-context) as its second argument. This allows you to read any locals that have been set in a middleware.

```ts
// src/pages/api/adminOnly.ts
import { defineApiRoute } from "astro-typesafe-api/server"

export const POST = defineApiRoute({
	input: z.string(),
	fetch: (name: string, { locals }) => {
		const { user } = locals
		if (!user) throw new Error("Visitor is not logged in.")
		if (!user.admin) throw new Error("User is not an admin.")
		...
	}
)
```

### Setting cookies

The `APIContext` object also includes a set of utility functions for managing cookies which has the same interface as [`Astro.cookies`](https://docs.astro.build/en/reference/api-reference/#astrocookies).

```ts
// src/pages/api/setPreferences.ts
import { defineApiRoute } from "astro-typesafe-api/server"

export const PATCH = defineApiRoute({
	input: z.object({
		theme: z.enum(["light", "dark"]),
	}),
	fetch: ({ theme }, { cookies }) => {
		cookies.set("theme", theme)
	}
)
```

### Adding response headers

The `TypedAPIContext` object extends `APIContext` by also including a `response` property which can be used to send additional headers to the browser and CDNs.

```ts
// src/pages/api/cached.ts
import { defineApiRoute } from "astro-typesafe-api/server"

export const GET = defineApiRoute({
	output: z.string(),
	fetch: (_, { response }) => {
		response.headers.set("Cache-Control", "max-age=3600")
		return "Hello, world!"
	}
)
```

### Adding request headers

The client-side `fetch()` method on the `api` object accepts the same options as the global `fetch` as its second argument. It can be used to set request headers.

```astro
---
// src/pages/index.astro
---
<script>
	import { api } from "astro-typesafe-api/client"

	const message = await api.cached.GET.fetch(undefined, {
		headers: {
			"Cache-Control": "no-cache",
		}
	})
</script>
```

## Troubleshooting

For help, check out the `Discussions` tab on the [GitHub repo](https://github.com/letsmoe/astro-typesafe-api/discussions).

## Contributing

This package is maintained by [letsmoe](https://github.com/letsmoe) independently from Astro. You're welcome to contribute by opening a PR or submitting an issue!