import assert from "node:assert"

import welcomeAction from "../src/actions/welcome.js"

describe("actions", function () {
	it("returns the welcome payload", function () {
		let jsonPayload = null
		const headers = {}

		const res = {
			set(name, value) {
				headers[name] = value
			},
			json(payload) {
				jsonPayload = payload
				return payload
			}
		}

		const returned = welcomeAction({}, res)

		assert.deepEqual(jsonPayload, {
			message: "Welcome to the Gatekeepr API!"
		})
		assert.equal(headers["X-Robots-Tag"], "noindex, nofollow")
		assert.deepEqual(returned, jsonPayload)
	})
})
