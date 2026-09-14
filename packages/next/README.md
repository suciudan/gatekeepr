# @gatekeepr/next

Gatekeepr helpers for Next.js server-side abuse protection.

Use this package in App Router Route Handlers, middleware-style server checks, or Server Actions before creating accounts, starting sessions, or accepting high-risk form submissions.

## Install

```sh
yarn add @gatekeepr/next
```

## App Router Route Handler

```js
import { createGatekeeprNext } from "@gatekeepr/next"

const gatekeepr = createGatekeeprNext({
	apiKey: process.env.GATEKEEPR_API_KEY
})

export const POST = gatekeepr.protectRoute(async (request) => {
	const body = await request.json()

	// Create the user or continue your signup flow here.
	return Response.json({ ok: true, email: body.email })
})
```

The default email extractor reads `email` or `user.email` from JSON and form requests by cloning the request, so your handler can still read the original body.

## Manual Check

```js
import { checkNextRequest } from "@gatekeepr/next"

export async function POST(request) {
	const decision = await checkNextRequest(request, {
		gatekeeprApiKey: process.env.GATEKEEPR_API_KEY
	})

	if(!decision.allowed) return decision.response

	return Response.json({ ok: true })
}
```

## Server Actions

```js
"use server"

import { headers } from "next/headers"
import { checkNextRequest } from "@gatekeepr/next"

export async function signup(formData) {
	const decision = await checkNextRequest(undefined, {
		gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
		headers: await headers(),
		email: formData.get("email")
	})

	if(!decision.allowed) {
		return {
			error: "Signup blocked."
		}
	}

	// Continue signup.
}
```

## Decisions

By default, only Gatekeepr `block` decisions are rejected. `challenge` decisions are allowed so you can decide how to handle extra verification in your own flow.

```js
const decision = await checkNextRequest(request, {
	gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
	rejectStatuses: ["block", "challenge"]
})
```

Customize the response returned from protected routes:

```js
const decision = await checkNextRequest(request, {
	gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
	blockMessage: (gatekeepr) => `Blocked: ${gatekeepr.threats.join(", ")}`,
	blockHttpCode: 429
})
```

The server-side decision includes the full Gatekeepr result as `decision.gatekeepr`. The HTTP response body keeps details minimal by default, but includes triggered `threats` when available.
