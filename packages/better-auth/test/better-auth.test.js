import assert from "node:assert"

import {
	betterAuthContextToGatekeeprPayload,
	betterAuthGatekeeprHook,
	checkBetterAuthContext,
	createGatekeeprBetterAuth,
	createGatekeeprBetterAuthPlugin,
	createGatekeeprClient,
	createPathMatcher,
	getClientIp,
	parseForwardedIp
} from "../src/index.js"

describe("@gatekeepr/better-auth", function () {
	it("builds a Gatekeepr payload from a Better Auth request context", async function () {
		const payload = await betterAuthContextToGatekeeprPayload({
			body: {
				email: " user@example.com "
			},
			headers: new Headers({
				"x-forwarded-for": "1.2.3.4, 5.6.7.8",
				"user-agent": "Mozilla/5.0"
			})
		})

		assert.deepEqual(payload, {
			email: "user@example.com",
			ip: "1.2.3.4",
			user_agent: "Mozilla/5.0"
		})
	})

	it("falls back through Better Auth email locations", async function () {
		assert.deepEqual(await betterAuthContextToGatekeeprPayload({
			context: {
				body: {
					email: "context-body@example.com"
				}
			}
		}), {
			email: "context-body@example.com"
		})

		assert.deepEqual(await betterAuthContextToGatekeeprPayload({
			context: {
				newSession: {
					user: {
						email: "session@example.com"
					}
				}
			}
		}), {
			email: "session@example.com"
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

	it("allows Better Auth requests when Gatekeepr allows", async function () {
		const decision = await checkBetterAuthContext({
			body: {
				email: "user@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "allow", threats: [] })
			}
		})

		assert.equal(decision.allowed, true)
		assert.equal(decision.response, undefined)
	})

	it("blocks Better Auth requests when Gatekeepr blocks", async function () {
		const decision = await checkBetterAuthContext({
			body: {
				email: "bot@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "block", threats: ["email_disposable"] })
			},
			blockMessage: (gatekeepr) => `Blocked: ${gatekeepr.threats[0]}`
		})

		assert.equal(decision.allowed, false)
		assert.equal(decision.response.status, 403)
		assert.deepEqual(await decision.response.json(), {
			error: "gatekeepr_blocked",
			message: "Blocked: email_disposable",
			status: "block",
			threats: ["email_disposable"]
		})
	})

	it("allows challenge decisions by default", async function () {
		const decision = await checkBetterAuthContext({
			body: {
				email: "user@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "challenge", threats: ["ip_aws"] })
			}
		})

		assert.equal(decision.allowed, true)
	})

	it("can reject challenge decisions", async function () {
		const decision = await checkBetterAuthContext({
			body: {
				email: "user@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "challenge", threats: ["ip_aws"] })
			},
			rejectStatuses: ["block", "challenge"]
		})

		assert.equal(decision.allowed, false)
		assert.equal(decision.response.status, 403)
	})

	it("allows missing email by default", async function () {
		const decision = await checkBetterAuthContext({}, {
			client: {
				check: async () => {
					throw new Error("should not call Gatekeepr without email")
				}
			}
		})

		assert.equal(decision.allowed, true)
		assert.equal(decision.status, "missing_email")
	})

	it("returns Better Auth hook context when allowed", async function () {
		const ctx = {
			body: {
				email: "user@example.com"
			}
		}

		const result = await betterAuthGatekeeprHook(ctx, {
			client: {
				check: async () => ({ status: "allow" })
			}
		})

		assert.deepEqual(result, { context: ctx })
	})

	it("returns Better Auth hook response when blocked", async function () {
		const result = await betterAuthGatekeeprHook({
			body: {
				email: "bot@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "block", threats: ["email_disposable"] })
			}
		})

		assert.equal(result.response.status, 403)
	})

	it("creates a Better Auth plugin for email sign-up and sign-in paths", async function () {
		const plugin = createGatekeeprBetterAuthPlugin({
			client: {
				check: async () => ({ status: "allow" })
			}
		})

		assert.equal(plugin.id, "gatekeepr")
		assert.equal(plugin.hooks.before.length, 1)
		assert.equal(plugin.hooks.before[0].matcher({ path: "/sign-up/email" }), true)
		assert.equal(plugin.hooks.before[0].matcher({ path: "/sign-in/email" }), true)
		assert.equal(plugin.hooks.before[0].matcher({ path: "/session" }), false)

		const result = await plugin.hooks.before[0].handler({
			body: {
				email: "user@example.com"
			}
		})

		assert.deepEqual(result.context, {
			body: {
				email: "user@example.com"
			}
		})
	})

	it("wraps Better Auth hook handlers with createAuthMiddleware when provided", async function () {
		const wrapped = []
		const plugin = createGatekeeprBetterAuthPlugin({
			createAuthMiddleware: (handler) => {
				wrapped.push(handler)
				return async (ctx) => handler({
					...ctx,
					wrapped: true
				})
			},
			client: {
				check: async () => ({ status: "allow" })
			}
		})

		const result = await plugin.hooks.before[0].handler({
			body: {
				email: "user@example.com"
			}
		})

		assert.equal(wrapped.length, 1)
		assert.equal(result.context.wrapped, true)
	})

	it("supports custom path matchers", function () {
		const matcher = createPathMatcher(["/magic-link/send"])

		assert.equal(matcher({ path: "/magic-link/send" }), true)
		assert.equal(matcher({ path: "/sign-up/email" }), false)
	})

	it("creates a reusable Better Auth helper with gatekeeprApiKey", async function () {
		const calls = []
		const gatekeepr = createGatekeeprBetterAuth({
			gatekeeprApiKey: "api-key",
			gatekeeprBaseUrl: "https://gatekeepr.test",
			fetcher: async (url, options) => {
				calls.push({ url, options })
				return new Response(JSON.stringify({ status: "allow" }), { status: 200 })
			}
		})

		const decision = await gatekeepr.checkContext({
			body: {
				email: "user@example.com"
			}
		})

		assert.equal(decision.allowed, true)
		assert.equal(calls[0].url, "https://gatekeepr.test")
		assert.equal(calls[0].options.headers.Authorization, "api-key")
	})
})
