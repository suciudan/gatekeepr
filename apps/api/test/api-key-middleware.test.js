import assert from "node:assert"

import { createApiKeyMiddleware } from "../src/middlewares/apiKeyMiddleware.js"
import { createNextSpy, createResponseRecorder } from "./helpers.js"

describe("api key middleware", function () {
	it("returns 401 when authorization is missing", async function () {
		const middleware = createApiKeyMiddleware()
		const recorder = createResponseRecorder()
		const nextSpy = createNextSpy()

		await middleware({ headers: {} }, recorder.res, nextSpy.next)

		assert.equal(recorder.statusCode, 401)
		assert.deepEqual(recorder.jsonPayload, {})
		assert.equal(nextSpy.called, false)
	})

	it("returns 401 when the api key is not found", async function () {
		const middleware = createApiKeyMiddleware({
			findApiKeyByValue: async () => null
		})
		const recorder = createResponseRecorder()
		const nextSpy = createNextSpy()

		await middleware({ headers: { authorization: "missing" } }, recorder.res, nextSpy.next)

		assert.equal(recorder.statusCode, 401)
		assert.deepEqual(recorder.jsonPayload, {})
		assert.equal(nextSpy.called, false)
	})

	it("returns 418 when the api key is disabled", async function () {
		const middleware = createApiKeyMiddleware({
			findApiKeyByValue: async () => ({ apiKey: "disabled", disabled: 1 })
		})
		const recorder = createResponseRecorder()
		const nextSpy = createNextSpy()

		await middleware({ headers: { authorization: "disabled" } }, recorder.res, nextSpy.next)

		assert.equal(recorder.statusCode, 418)
		assert.deepEqual(recorder.jsonPayload, {})
		assert.equal(nextSpy.called, false)
	})

	it("stores the api key and continues when the key is valid", async function () {
		const middleware = createApiKeyMiddleware({
			findApiKeyByValue: async () => ({ apiKey: "valid-key", disabled: 0 })
		})
		const req = {
			headers: {
				authorization: "valid-key"
			}
		}
		const recorder = createResponseRecorder()
		const nextSpy = createNextSpy()

		await middleware(req, recorder.res, nextSpy.next)

		assert.equal(req.api_key, "valid-key")
		assert.equal(nextSpy.called, true)
		assert.equal(recorder.jsonPayload, null)
	})
})
