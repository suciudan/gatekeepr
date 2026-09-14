import assert from "node:assert"

import {
	authJsSignIn,
	authJsSignInToGatekeeprPayload,
	checkAuthJsSignIn,
	composeSignInCallbacks,
	createGatekeeprAuth,
	createGatekeeprCallbacks,
	createGatekeeprClient,
	getClientIp,
	parseForwardedIp
} from "../src/index.js"

describe("@gatekeepr/authjs", function () {
	it("extracts email, IP, and user agent from Auth.js params plus request headers", async function () {
		const request = new Request("https://app.test/api/auth/signin", {
			headers: {
				"x-forwarded-for": "1.2.3.4, 5.6.7.8",
				"user-agent": "Mozilla/5.0"
			}
		})

		const payload = await authJsSignInToGatekeeprPayload({
			user: {
				email: " user@example.com "
			}
		}, {
			request
		})

		assert.deepEqual(payload, {
			email: "user@example.com",
			ip: "1.2.3.4",
			user_agent: "Mozilla/5.0"
		})
	})

	it("falls back through Auth.js email sources", async function () {
		assert.deepEqual(await authJsSignInToGatekeeprPayload({
			profile: {
				email: "profile@example.com"
			}
		}), {
			email: "profile@example.com"
		})

		assert.deepEqual(await authJsSignInToGatekeeprPayload({
			credentials: {
				email: "credentials@example.com"
			}
		}), {
			email: "credentials@example.com"
		})
	})

	it("extracts client IP from common proxy headers", function () {
		assert.equal(getClientIp(new Headers({
			"cf-connecting-ip": "9.9.9.9"
		})), "9.9.9.9")

		assert.equal(parseForwardedIp("for=\"[2001:db8:cafe::17]:4711\"", "forwarded"), "2001:db8:cafe::17")
	})

	it("sends checks to the Gatekeepr API", async function () {
		const calls = []
		const client = createGatekeeprClient({
			apiKey: "api-key",
			baseUrl: "https://gatekeepr.test/",
			fetcher: async (url, options) => {
				calls.push({ url, options })
				return new Response(JSON.stringify({ status: "allow" }), { status: 200 })
			}
		})

		const result = await client.check({
			email: " user@example.com ",
			ip: " 1.2.3.4 "
		})

		assert.deepEqual(result, { status: "allow" })
		assert.equal(calls[0].url, "https://gatekeepr.test")
		assert.equal(calls[0].options.headers.Authorization, "api-key")
		assert.deepEqual(JSON.parse(calls[0].options.body), {
			email: "user@example.com",
			ip: "1.2.3.4"
		})
	})

	it("allows Auth.js sign in when Gatekeepr allows", async function () {
		const decision = await checkAuthJsSignIn({
			user: {
				email: "user@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "allow", threats: [] })
			}
		})

		assert.equal(decision.allowed, true)
		assert.equal(decision.result, true)
	})

	it("blocks Auth.js sign in when Gatekeepr blocks", async function () {
		const decision = await checkAuthJsSignIn({
			user: {
				email: "bot@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "block", threats: ["email_disposable"] })
			}
		})

		assert.equal(decision.allowed, false)
		assert.equal(decision.result, false)
		assert.equal(decision.status, "block")
	})

	it("can redirect blocked Auth.js sign ins", async function () {
		const result = await authJsSignIn({
			user: {
				email: "bot@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "block", threats: ["email_disposable"] })
			},
			blockResult: (gatekeepr) => `/auth/blocked?reason=${gatekeepr.threats[0]}`
		})

		assert.equal(result, "/auth/blocked?reason=email_disposable")
	})

	it("allows challenge decisions by default", async function () {
		const result = await authJsSignIn({
			user: {
				email: "user@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "challenge", threats: ["ip_aws"] })
			}
		})

		assert.equal(result, true)
	})

	it("can reject challenge decisions", async function () {
		const result = await authJsSignIn({
			user: {
				email: "user@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "challenge", threats: ["ip_aws"] })
			},
			rejectStatuses: ["block", "challenge"]
		})

		assert.equal(result, false)
	})

	it("allows missing email by default", async function () {
		const decision = await checkAuthJsSignIn({}, {
			client: {
				check: async () => {
					throw new Error("should not call Gatekeepr without email")
				}
			}
		})

		assert.equal(decision.allowed, true)
		assert.equal(decision.status, "missing_email")
		assert.equal(decision.result, true)
	})

	it("composes signIn callbacks and stops on the first denial", async function () {
		const calls = []
		const signIn = composeSignInCallbacks(
			async () => {
				calls.push("gatekeepr")
				return false
			},
			async () => {
				calls.push("existing")
				return true
			}
		)

		assert.equal(await signIn({}), false)
		assert.deepEqual(calls, ["gatekeepr"])
	})

	it("preserves existing callbacks while wrapping signIn", async function () {
		const callbacks = createGatekeeprCallbacks({
			session: async (params) => params.session,
			signIn: async () => "/existing-deny"
		}, {
			client: {
				check: async () => ({ status: "allow" })
			}
		})

		const result = await callbacks.signIn({
			user: {
				email: "user@example.com"
			}
		})

		assert.equal(result, "/existing-deny")
		assert.equal(typeof callbacks.session, "function")
	})

	it("creates a reusable Auth.js helper", async function () {
		const gatekeepr = createGatekeeprAuth({
			client: {
				check: async () => ({ status: "block", threats: ["ip_tor_exit_node"] })
			}
		})

		const result = await gatekeepr.signIn({
			user: {
				email: "bot@example.com"
			}
		})

		assert.equal(result, false)
	})

	it("creates a reusable Auth.js helper with gatekeeprApiKey", async function () {
		const calls = []
		const gatekeepr = createGatekeeprAuth({
			gatekeeprApiKey: "api-key",
			gatekeeprBaseUrl: "https://gatekeepr.test",
			fetcher: async (url, options) => {
				calls.push({ url, options })
				return new Response(JSON.stringify({ status: "allow" }), { status: 200 })
			}
		})

		const result = await gatekeepr.signIn({
			user: {
				email: "user@example.com"
			}
		})

		assert.equal(result, true)
		assert.equal(calls[0].url, "https://gatekeepr.test")
		assert.equal(calls[0].options.headers.Authorization, "api-key")
	})
})
