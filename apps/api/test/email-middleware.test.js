import assert from "node:assert"

import emailMiddleware from "../src/middlewares/emailMiddleware.js"
import { createCtx } from "./helpers.js"

describe("email middleware", function () {
	it("returns 400 when email is missing", async function () {
		const req = {
			body: {},
			ctx: createCtx()
		}
		let jsonPayload = null

		const res = {
			status() {
				return this
			},
			json(payload) {
				jsonPayload = payload
				return payload
			}
		}

		await emailMiddleware(req, res, () => {
			throw new Error("should not continue")
		})

		assert.deepEqual(jsonPayload, { error: "email_required" })
	})

	it("returns 400 for invalid emails without a status payload", async function () {
		const req = {
			body: {
				email: "not-an-email"
			},
			ctx: createCtx({ email: "not-an-email" })
		}
		let statusCode = 200
		let jsonPayload = null
		let nextCalled = false

		const res = {
			status(code) {
				statusCode = code
				return this
			},
			json(payload) {
				jsonPayload = payload
				return payload
			}
		}

		await emailMiddleware(req, res, () => {
			nextCalled = true
		})

		assert.equal(statusCode, 400)
		assert.deepEqual(jsonPayload, { error: "email_invalid" })
		assert.equal(nextCalled, false)
		assert.ok(!("status" in jsonPayload))
	})
})
