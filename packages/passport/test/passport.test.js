import assert from "node:assert"

import {
	checkPassportRequest,
	createGatekeeprClient,
	createGatekeeprPassport,
	createGatekeeprPassportMiddleware,
	getClientIp,
	parseForwardedIp,
	passportRequestToGatekeeprPayload
} from "../src/index.js"

const createResponse = () => {
	const res = {
		headers: {},
		statusCode: 200,
		body: undefined,
		status(code) {
			this.statusCode = code
			return this
		},
		json(body) {
			this.body = body
			return this
		},
		setHeader(name, value) {
			this.headers[name] = value
		},
		end(body) {
			this.body = body
			return this
		}
	}

	return res
}

describe("@gatekeepr/passport", function () {
	it("builds a Gatekeepr payload from an Express request", async function () {
		const payload = await passportRequestToGatekeeprPayload({
			body: {
				email: " user@example.com "
			},
			headers: {
				"x-forwarded-for": "1.2.3.4, 5.6.7.8",
				"user-agent": "Mozilla/5.0"
			}
		})

		assert.deepEqual(payload, {
			email: "user@example.com",
			ip: "1.2.3.4",
			user_agent: "Mozilla/5.0"
		})
	})

	it("falls back through common Passport email locations", async function () {
		assert.deepEqual(await passportRequestToGatekeeprPayload({
			body: {
				username: "username@example.com"
			}
		}), {
			email: "username@example.com"
		})

		assert.deepEqual(await passportRequestToGatekeeprPayload({
			body: {
				user: {
					email: "nested@example.com"
				}
			}
		}), {
			email: "nested@example.com"
		})

		assert.deepEqual(await passportRequestToGatekeeprPayload({
			user: {
				email: "user@example.com"
			}
		}), {
			email: "user@example.com"
		})

		assert.deepEqual(await passportRequestToGatekeeprPayload({
			email: "request@example.com"
		}), {
			email: "request@example.com"
		})
	})

	it("extracts client IP from common proxy headers", function () {
		assert.equal(getClientIp({
			"cf-connecting-ip": "9.9.9.9"
		}), "9.9.9.9")

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

	it("allows Passport requests when Gatekeepr allows", async function () {
		const decision = await checkPassportRequest({
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

	it("blocks Passport requests when Gatekeepr blocks", async function () {
		const decision = await checkPassportRequest({
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
		assert.deepEqual(decision.response, {
			status: 403,
			body: {
				error: "gatekeepr_blocked",
				message: "Blocked: email_disposable",
				status: "block",
				threats: ["email_disposable"]
			}
		})
	})

	it("allows challenge decisions by default", async function () {
		const decision = await checkPassportRequest({
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
		const decision = await checkPassportRequest({
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
		const decision = await checkPassportRequest({}, {
			client: {
				check: async () => {
					throw new Error("should not call Gatekeepr without email")
				}
			}
		})

		assert.equal(decision.allowed, true)
		assert.equal(decision.status, "missing_email")
	})

	it("continues Passport middleware when allowed", async function () {
		const middleware = createGatekeeprPassportMiddleware({
			client: {
				check: async () => ({ status: "allow" })
			}
		})
		let nextCalled = false

		await middleware({
			body: {
				email: "user@example.com"
			}
		}, createResponse(), () => {
			nextCalled = true
		})

		assert.equal(nextCalled, true)
	})

	it("sends an Express JSON response when blocked", async function () {
		const middleware = createGatekeeprPassportMiddleware({
			client: {
				check: async () => ({ status: "block", threats: ["email_disposable"] })
			}
		})
		const res = createResponse()
		let nextCalled = false

		await middleware({
			body: {
				email: "bot@example.com"
			}
		}, res, () => {
			nextCalled = true
		})

		assert.equal(nextCalled, false)
		assert.equal(res.statusCode, 403)
		assert.deepEqual(res.body, {
			error: "gatekeepr_blocked",
			message: "Request blocked by Gatekeepr.",
			status: "block",
			threats: ["email_disposable"]
		})
	})

	it("supports custom middleware rejection handling", async function () {
		const middleware = createGatekeeprPassportMiddleware({
			client: {
				check: async () => ({ status: "block" })
			},
			onReject: (decision, req, res) => {
				res.status(429).json({
					status: decision.status
				})
			}
		})
		const res = createResponse()

		await middleware({
			body: {
				email: "bot@example.com"
			}
		}, res, () => {})

		assert.equal(res.statusCode, 429)
		assert.deepEqual(res.body, {
			status: "block"
		})
	})

	it("creates a reusable Passport helper with gatekeeprApiKey", async function () {
		const calls = []
		const gatekeepr = createGatekeeprPassport({
			gatekeeprApiKey: "api-key",
			gatekeeprBaseUrl: "https://gatekeepr.test",
			fetcher: async (url, options) => {
				calls.push({ url, options })
				return new Response(JSON.stringify({ status: "allow" }), { status: 200 })
			}
		})

		const decision = await gatekeepr.checkRequest({
			body: {
				email: "user@example.com"
			}
		})

		assert.equal(decision.allowed, true)
		assert.equal(calls[0].url, "https://gatekeepr.test")
		assert.equal(calls[0].options.headers.Authorization, "api-key")
	})
})
