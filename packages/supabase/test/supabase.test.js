import assert from "node:assert"

import {
	cleanGatekeeprPayload,
	createBeforeUserCreatedHook,
	createGatekeeprClient,
	evaluateSupabaseAuthEvent,
	normalizeSupabaseHookSecret,
	supabaseAuthEventToGatekeeprPayload
} from "../src/index.js"

describe("@gatekeepr/supabase", function () {
	it("normalizes Supabase Auth hook secrets", function () {
		assert.equal(normalizeSupabaseHookSecret("v1,whsec_secret"), "secret")
		assert.equal(normalizeSupabaseHookSecret("secret"), "secret")
	})

	it("builds a Gatekeepr payload from a Supabase Auth event", function () {
		const payload = supabaseAuthEventToGatekeeprPayload({
			metadata: {
				ip_address: " 1.2.3.4 ",
				headers: {
					"User-Agent": " Mozilla/5.0 "
				}
			},
			user: {
				email: " user@example.com "
			}
		})

		assert.deepEqual(payload, {
			email: "user@example.com",
			ip: "1.2.3.4",
			user_agent: "Mozilla/5.0"
		})
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
			ip: " 1.2.3.4 ",
			userAgent: " Mozilla/5.0 "
		})

		assert.deepEqual(result, { status: "allow" })
		assert.equal(calls[0].url, "https://gatekeepr.test")
		assert.equal(calls[0].options.method, "POST")
		assert.equal(calls[0].options.headers.Authorization, "api-key")
		assert.deepEqual(JSON.parse(calls[0].options.body), {
			email: "user@example.com",
			ip: "1.2.3.4",
			user_agent: "Mozilla/5.0"
		})
	})

	it("allows Supabase signup when Gatekeepr allows", async function () {
		const decision = await evaluateSupabaseAuthEvent({
			metadata: {
				ip_address: "1.2.3.4"
			},
			user: {
				email: "user@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "allow", threats: [] })
			}
		})

		assert.equal(decision.allowed, true)
		assert.deepEqual(decision.supabase, {
			status: 200,
			body: {}
		})
	})

	it("blocks Supabase signup when Gatekeepr blocks", async function () {
		const decision = await evaluateSupabaseAuthEvent({
			user: {
				email: "bot@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "block", threats: ["email_disposable"] })
			},
			blockMessage: (gatekeepr) => `Blocked: ${gatekeepr.threats[0]}`
		})

		assert.equal(decision.allowed, false)
		assert.deepEqual(decision.supabase, {
			status: 403,
			body: {
				error: {
					http_code: 403,
					message: "Blocked: email_disposable"
				}
			}
		})
	})

	it("allows challenge decisions by default", async function () {
		const decision = await evaluateSupabaseAuthEvent({
			user: {
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
		const decision = await evaluateSupabaseAuthEvent({
			user: {
				email: "user@example.com"
			}
		}, {
			client: {
				check: async () => ({ status: "challenge", threats: ["ip_aws"] })
			},
			rejectStatuses: ["block", "challenge"]
		})

		assert.equal(decision.allowed, false)
		assert.equal(decision.supabase.status, 403)
	})

	it("allows missing email events by default", async function () {
		const decision = await evaluateSupabaseAuthEvent({
			metadata: {
				ip_address: "1.2.3.4"
			}
		}, {
			client: {
				check: async () => {
					throw new Error("should not call Gatekeepr without email")
				}
			}
		})

		assert.equal(decision.allowed, true)
		assert.equal(decision.status, "missing_email")
	})

	it("creates a before-user-created HTTP handler", async function () {
		const handler = createBeforeUserCreatedHook({
			client: {
				check: async (payload) => {
					assert.deepEqual(payload, {
						email: "bot@example.com",
						ip: "1.2.3.4"
					})
					return {
						status: "block",
						threats: ["email_disposable"]
					}
				}
			}
		})

		const res = await handler(new Request("https://example.test/auth-hook", {
			method: "POST",
			body: JSON.stringify({
				metadata: {
					ip_address: "1.2.3.4"
				},
				user: {
					email: "bot@example.com"
				}
			})
		}))

		assert.equal(res.status, 403)
		assert.deepEqual(await res.json(), {
			error: {
				http_code: 403,
				message: "Signup blocked by Gatekeepr."
			}
		})
	})

	it("cleans empty Gatekeepr fields", function () {
		assert.deepEqual(cleanGatekeeprPayload({
			email: " user@example.com ",
			ip: "",
			user_agent: null
		}), {
			email: "user@example.com"
		})
	})
})
