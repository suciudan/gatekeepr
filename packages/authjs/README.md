# @gatekeepr/authjs

Gatekeepr helpers for Auth.js sign-in abuse protection.

The package is built around Auth.js `callbacks.signIn`. Gatekeepr checks run before Auth.js continues the sign-in flow. Returning `true` allows sign-in, `false` blocks it, and a string redirects to a URL.

## Install

```sh
yarn add @gatekeepr/authjs
```

## NextAuth / Auth.js Lazy Initialization

Auth.js lazy initialization gives the callback access to the current request, which lets Gatekeepr read IP and User-Agent headers.

```js
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { createGatekeeprAuth } from "@gatekeepr/authjs"

export const { handlers, auth } = NextAuth((request) => {
	const gatekeepr = createGatekeeprAuth({
		gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
		request
	})

	return {
		providers: [GitHub],
		callbacks: {
			signIn: gatekeepr.signIn
		}
	}
})
```

## Preserve Existing Callbacks

```js
export const { handlers, auth } = NextAuth((request) => {
	const gatekeepr = createGatekeeprAuth({
		gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
		request
	})

	return {
		providers: [GitHub],
		callbacks: gatekeepr.callbacks({
			async signIn({ profile }) {
				return profile?.email?.endsWith("@example.com")
			},
			async session({ session }) {
				return session
			}
		})
	}
})
```

Gatekeepr runs first. If Gatekeepr blocks, your existing `signIn` callback is not called. If Gatekeepr allows, the existing callback decides next.

## Redirect Blocked Sign-Ins

```js
const gatekeepr = createGatekeeprAuth({
	gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
	request,
	blockResult: (gatekeepr) => `/auth/blocked?status=${gatekeepr.status}`
})
```

## Decisions

By default, only Gatekeepr `block` decisions reject sign-in. `challenge` decisions are allowed so your product can decide whether to ask for extra verification after sign-in.

```js
const gatekeepr = createGatekeeprAuth({
	gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
	request,
	rejectStatuses: ["block", "challenge"]
})
```

## Lower-Level Usage

```js
import { checkAuthJsSignIn } from "@gatekeepr/authjs"

callbacks: {
	async signIn(params) {
		const decision = await checkAuthJsSignIn(params, {
			gatekeeprApiKey: process.env.GATEKEEPR_API_KEY,
			headers: request.headers
		})

		return decision.result
	}
}
```

The decision object includes `decision.gatekeepr` for server-side logging and `decision.payload` for the exact email/IP/User-Agent payload sent to Gatekeepr.
