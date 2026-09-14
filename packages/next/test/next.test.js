import assert from "node:assert"

import {
	buildNextGatekeeprPayload,
	checkNextRequest,
	createGatekeeprClient,
	createGatekeeprNext,
	createProtectedRoute,
	getClientIp,
	parseForwardedIp
} from "../src/index.js"

describe("@gatekeepr/next", function () {
	it("extracts the client IP from common proxy headers", function () {
		assert.equal(getClientIp(new Headers({
			"x-forwarded-for": "1.2.3.4, 5.6.7.8"
		})), "1.2.3.4")

		assert.equal(getClientIp({
			"cf-connecting-ip": "9.9.9.9"
		}), "9.9.9.9")
	})

	it("parses Forwarded header IP values", function () {
		assert.equal(parseForwardedIp("for=192.0.2.60;proto=https", "forwarded"), "192.0.2.60")
		assert.equal(parseForwardedIp("for=\"[2001:db8:cafe::17]:4711\"", "forwarded"), "2001:db8:cafe::17")
	})

	it("builds a Gatekeepr payload from a JSON route request", async function () {
		const request = new Request("https://app.test/api/signup", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"user-agent": "Mozilla/5.0",
				"x-forwarded-for": "1.2.3.4"
			},
			body: JSON.stringify({
				email: " user@example.com "
			})
		})

		const payload = await buildNextGatekeeprPayload(request)

		assert.deepEqual(payload, {
			email: "user@example.com",
			ip: "1.2.3.4",
			user_agent: "Mozilla/5.0"
		})
	})

	it("builds a Gatekeepr payload from nested JSON email paths", async function () {
		const request = new Request("https://app.test/api/signup", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				user: {
					email: "nested@example.com"
				}
			})
		})

		const payload = await buildNextGatekeeprPayload(request)

		assert.deepEqual(payload, {
			email: "nested@example.com"
		})
	})

	it("builds a Gatekeepr payload from form data", async function () {
		const form = new FormData()
		form.set("email", " form@example.com ")

		const request = new Request("https://app.test/api/signup", {
			method: "POST",
			headers: {
				"x-real-ip": "8.8.8.8"
			},
			body: form
		})

		const payload = await buildNextGatekeeprPayload(request)

		assert.deepEqual(payload, {
			email: "form@example.com",
			ip: "8.8.8.8"
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

	it("allows requests when Gatekeepr allows", async function () {
		const decision = await checkNextRequest(new Request("https://app.test/api/signup"), {
			email: "user@example.com",
			client: {
				check: async () => ({ status: "allow", threats: [] })
			}
		})

		assert.equal(decision.allowed, true)
		assert.equal(decision.response, undefined)
	})

	it("blocks requests when Gatekeepr blocks", async function () {
		const decision = await checkNextRequest(new Request("https://app.test/api/signup"), {
			email: "bot@example.com",
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
		const decision = await checkNextRequest(new Request("https://app.test/api/signup"), {
			email: "user@example.com",
			client: {
				check: async () => ({ status: "challenge", threats: ["ip_aws"] })
			}
		})

		assert.equal(decision.allowed, true)
	})

	it("can reject challenge decisions", async function () {
		const decision = await checkNextRequest(new Request("https://app.test/api/signup"), {
			email: "user@example.com",
			client: {
				check: async () => ({ status: "challenge", threats: ["ip_aws"] })
			},
			rejectStatuses: ["block", "challenge"]
		})

		assert.equal(decision.allowed, false)
		assert.equal(decision.response.status, 403)
	})

	it("wraps route handlers", async function () {
		const route = createProtectedRoute(async (request, context, decision) => {
			return Response.json({
				ok: true,
				path: context.path,
				status: decision.status
			})
		}, {
			email: "user@example.com",
			client: {
				check: async () => ({ status: "allow" })
			}
		})

		const res = await route(new Request("https://app.test/api/signup"), {
			path: "/api/signup"
		})

		assert.equal(res.status, 200)
		assert.deepEqual(await res.json(), {
			ok: true,
			path: "/api/signup",
			status: "allow"
		})
	})

	it("creates a reusable Next helper", async function () {
		const gatekeepr = createGatekeeprNext({
			client: {
				check: async () => ({ status: "block", threats: ["ip_tor_exit_node"] })
			},
			email: "bot@example.com"
		})

		const decision = await gatekeepr.checkRequest(new Request("https://app.test/api/signup"))

		assert.equal(decision.allowed, false)
		assert.equal(decision.status, "block")
	})

	it("creates a reusable Next helper with gatekeeprApiKey", async function () {
		const calls = []
		const gatekeepr = createGatekeeprNext({
			gatekeeprApiKey: "api-key",
			gatekeeprBaseUrl: "https://gatekeepr.test",
			fetcher: async (url, options) => {
				calls.push({ url, options })
				return new Response(JSON.stringify({ status: "allow" }), { status: 200 })
			},
			email: "user@example.com"
		})

		const decision = await gatekeepr.checkRequest()

		assert.equal(decision.allowed, true)
		assert.equal(calls[0].url, "https://gatekeepr.test")
		assert.equal(calls[0].options.headers.Authorization, "api-key")
	})
})
