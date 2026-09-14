import assert from "node:assert"

import processAction, { buildCheckOrder, createProcessAction } from "../src/actions/process.js"
import { createCtx } from "./helpers.js"

describe("process action", function () {
	it("returns status without fraud_score on successful responses", async function () {
		const req = {
			ctx: createCtx({
				halt: true,
				threats: ["email_disposable", "domain_whois_error"]
			})
		}
		let jsonPayload = null

		const res = {
			json(payload) {
				jsonPayload = payload
				return payload
			}
		}

		await processAction(req, res)

		assert.equal(jsonPayload.status, "block")
		assert.deepEqual(jsonPayload.threats, ["email_disposable", "domain_whois_error"])
		assert.ok(!("fraud_score" in jsonPayload))
		assert.ok(!("payload" in jsonPayload))
		assert.ok(!("halt" in jsonPayload))
	})

	it("builds dependency order with prerequisites first", function () {
		const order = buildCheckOrder({
			first: { deps: [], fn: () => {} },
			second: { deps: ["first"], fn: () => {} },
			third: { deps: ["second"], fn: () => {} }
		})

		assert.ok(order.indexOf("first") < order.indexOf("second"))
		assert.ok(order.indexOf("second") < order.indexOf("third"))
	})

	it("stops scheduling new work once halt is set", async function () {
		const executed = []
		const action = createProcessAction({
			checksConfig: {
				first: {
					deps: [],
					fn: async (ctx) => {
						executed.push("first")
						ctx.halt = true
					}
				},
				second: {
					deps: [],
					fn: async () => {
						executed.push("second")
					}
				},
				third: {
					deps: ["first"],
					fn: async () => {
						executed.push("third")
					}
				}
			},
			limitFactory: () => async (fn) => fn(),
			finalize: (ctx) => ctx
		})
		const req = {
			ctx: createCtx()
		}
		let jsonPayload = null

		const res = {
			json(payload) {
				jsonPayload = payload
				return payload
			}
		}

		await action(req, res)

		assert.ok(executed.includes("first"))
		assert.ok(!executed.includes("third"))
		assert.equal(jsonPayload.halt, true)
	})

	it("skips queued ready tasks after halt flips inside the same batch", async function () {
		const executed = []
		const limitFactory = () => {
			let running = false
			const queue = []

			const runNext = () => {
				if(running || queue.length === 0) return

				running = true

				const { fn, resolve, reject } = queue.shift()

				Promise.resolve()
					.then(fn)
					.then(resolve, reject)
					.finally(() => {
						running = false
						runNext()
					})
			}

			return (fn) => new Promise((resolve, reject) => {
				queue.push({ fn, resolve, reject })
				runNext()
			})
		}

		const action = createProcessAction({
			checksConfig: {
				first: {
					deps: [],
					fn: async (ctx) => {
						executed.push("first")
						ctx.halt = true
					}
				},
				second: {
					deps: [],
					fn: async () => {
						executed.push("second")
					}
				}
			},
			limitFactory,
			concurrency: 1,
			finalize: (ctx) => ctx
		})

		const req = {
			ctx: createCtx()
		}

		const res = {
			json(payload) {
				return payload
			}
		}

		await action(req, res)

		assert.deepEqual(executed, ["first"])
	})
})
