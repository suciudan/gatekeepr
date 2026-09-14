import assert from "node:assert"

import ctxMiddleware from "../src/middlewares/ctxMiddleware.js"
import { createUsageMiddleware } from "../src/middlewares/usageMiddleware.js"
import { createNextSpy, createResponseRecorder } from "./helpers.js"

describe("ctx middleware", function () {
	it("trims known payload fields", async function () {
		const req = {
			body: {
				email: " user@gmail.com ",
				ip: " 1.2.3.4 ",
				user_agent: " curl/8.0 "
			}
		}
		const nextSpy = createNextSpy()

		await ctxMiddleware(req, {}, nextSpy.next)

		assert.equal(nextSpy.called, true)
		assert.deepEqual(req.ctx.payload, {
			email: "user@gmail.com",
			ip: "1.2.3.4",
			user_agent: "curl/8.0"
		})
	})

	it("handles missing optional fields without throwing", async function () {
		const req = {
			body: {
				email: "user@gmail.com"
			}
		}
		const nextSpy = createNextSpy()

		await ctxMiddleware(req, {}, nextSpy.next)

		assert.equal(nextSpy.called, true)
		assert.deepEqual(req.ctx.payload, {
			email: "user@gmail.com",
			ip: undefined,
			user_agent: undefined
		})
	})
})

describe("usage middleware", function () {
	it("returns 402 when no usage remains", async function () {
		const middleware = createUsageMiddleware({
			checkUsageFn: async () => false,
			logUsageFn: async () => {
				throw new Error("should not be called")
			}
		})
		const recorder = createResponseRecorder()
		const nextSpy = createNextSpy()

		await middleware({ api_key: "key" }, recorder.res, nextSpy.next)

		assert.equal(recorder.statusCode, 402)
		assert.equal(nextSpy.called, false)
		assert.ok(recorder.jsonPayload.error.includes("request limit"))
	})

	it("logs usage and continues when usage remains", async function () {
		let loggedKey = null
		const middleware = createUsageMiddleware({
			checkUsageFn: async () => true,
			logUsageFn: async (apiKey) => {
				loggedKey = apiKey
			}
		})
		const recorder = createResponseRecorder()
		const nextSpy = createNextSpy()

		await middleware({ api_key: "key" }, recorder.res, nextSpy.next)

		assert.equal(loggedKey, "key")
		assert.equal(nextSpy.called, true)
		assert.equal(recorder.jsonPayload, null)
	})
})
