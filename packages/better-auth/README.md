# @gatekeepr/better-auth

Gatekeepr helpers for Better Auth email sign-up and sign-in abuse protection.

The package ships a Better Auth server plugin that runs before `/sign-up/email` and `/sign-in/email`, extracts the email/IP/User-Agent signal set, checks Gatekeepr, and interrupts the request with a `Response` when the request should be blocked.

## Install

```sh
yarn add @gatekeepr/better-auth
```

## Better Auth Plugin

```js
import { betterAuth } from "better-auth"
import { createGatekeeprBetterAuthPlugin } from "@gatekeepr/better-auth/api"

export const auth = betterAuth({
	emailAndPassword: {
		enabled: true
	},
	plugins: [
		createGatekeeprBetterAuthPlugin({
			gatekeeprApiKey: process.env.GATEKEEPR_API_KEY
		})
	]
})
```

The `/api` export wraps the hook with Better Auth's `createAuthMiddleware`. Use the root export for lower-level testing or custom middleware wiring.

By default, the plugin protects Better Auth's email/password sign-up and sign-in endpoints:

```js
["/sign-up/email", "/sign-in/email"]
```

## Decisions

By default, only Gatekeepr `block` decisions interrupt the Better Auth request. `challenge` decisions are allowed so your app can choose whether to add extra verification later.

```js
createGatekeeprBetterAuthPlugin({
	gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
	rejectStatuses: ["block", "challenge"]
})
```

Customize the blocked response:

```js
createGatekeeprBetterAuthPlugin({
	gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
	blockHttpCode: 429,
	blockMessage: (gatekeepr) => `Blocked: ${gatekeepr.threats.join(", ")}`
})
```

## Custom Paths

Use `matchPaths` for additional Better Auth endpoints that carry an email in the request body.

```js
createGatekeeprBetterAuthPlugin({
	gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
	matchPaths: [
		"/sign-up/email",
		"/sign-in/email",
		"/magic-link/send"
	]
})
```

Use `getEmail`, `getIp`, or `getUserAgent` when your app stores these signals in custom context fields.

```js
createGatekeeprBetterAuthPlugin({
	gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
	getEmail: (ctx) => ctx.body.loginEmail
})
```

## Lower-Level Usage

```js
import {
	checkBetterAuthContext,
	createGatekeeprBetterAuth
} from "@gatekeepr/better-auth"

const gatekeepr = createGatekeeprBetterAuth({
	gatekeeprApiKey: process.env.GATEKEEPR_API_KEY
})

const decision = await gatekeepr.checkContext(ctx)
if(!decision.allowed) return { response: decision.response }
```

The decision object includes `decision.gatekeepr` for server-side logging and `decision.payload` for the exact email/IP/User-Agent payload sent to Gatekeepr.
