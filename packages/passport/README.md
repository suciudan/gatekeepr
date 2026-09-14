# @gatekeepr/passport

Passport.js and Express helpers for checking signup and login requests with Gatekeepr before Passport creates a session or account.

## Install

```sh
yarn add @gatekeepr/passport
```

## Express middleware

Place the middleware before `passport.authenticate()` on signup, login, invite acceptance, or any flow where fake accounts should be stopped before auth state is created.

```js
import passport from "passport"
import { createGatekeeprPassport } from "@gatekeepr/passport"

const gatekeepr = createGatekeeprPassport({
	gatekeeprApiKey: process.env.GATEKEEPR_API_KEY
})

app.post(
	"/signup",
	gatekeepr.middleware(),
	passport.authenticate("local", { failureRedirect: "/signup" }),
	(req, res) => {
		res.redirect("/dashboard")
	}
)
```

By default, Gatekeepr `block` decisions return a `403` JSON response and `challenge` decisions continue. To reject challenges too:

```js
app.post(
	"/login",
	gatekeepr.middleware({
		rejectStatuses: ["block", "challenge"]
	}),
	passport.authenticate("local")
)
```

## Manual checks

```js
import { checkPassportRequest } from "@gatekeepr/passport"

app.post("/signup", async (req, res, next) => {
	const decision = await checkPassportRequest(req, {
		gatekeeprApiKey: process.env.GATEKEEPR_API_KEY
	})

	if(!decision.allowed) {
		return res.status(decision.response.status).json(decision.response.body)
	}

	return next()
})
```

## Request fields

The helper reads:

- email from `req.body.email`, `req.body.username`, nested `req.body.user.email`, `req.query`, `req.params`, or `req.user.email`
- IP from common proxy headers, then `req.ip`, `req.ips[0]`, `req.socket.remoteAddress`, or `req.connection.remoteAddress`
- user agent from the `User-Agent` header

Override extraction when your Passport strategy uses different fields:

```js
gatekeepr.middleware({
	getEmail: (req) => req.body.login,
	getIp: (req) => req.ip,
	getUserAgent: (req) => req.get("user-agent")
})
```

## Options

- `gatekeeprApiKey` or `apiKey`: Gatekeepr API key.
- `gatekeeprBaseUrl` or `baseUrl`: alternate Gatekeepr API URL.
- `rejectStatuses`: statuses to reject, default `["block"]`.
- `missingEmail`: `allow` or `block`, default `allow`.
- `blockMessage`: string or `(gatekeepr, req) => string`.
- `blockHttpCode`: HTTP status for blocked responses, default `403`.
- `includeGatekeeprResult`: include the full Gatekeepr result in blocked JSON.
- `onReject`: custom Express response handler for middleware.
- `emailFields` / `emailSources`: customize default field lookup.
