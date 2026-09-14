import assert from "node:assert"

import request from "supertest"

import { createApp } from "../src/app.js"

describe("app routing", function () {
	it("runs before-route middleware before handlers", async function () {
		const app = createApp({
			beforeRoutes: [
				(req, res, next) => {
					req.beforeRoute = true
					next()
				}
			],
			welcomeHandler: (req, res) => res.json({ beforeRoute: req.beforeRoute })
		})

		const res = await request(app).get("/")

		assert.equal(res.status, 200)
		assert.deepEqual(res.body, { beforeRoute: true })
	})

	it("returns pong on /ping when auth passes", async function () {
		const app = createApp({
			apiKeyHandler: (req, res, next) => {
				req.api_key = "valid-key"
				next()
			}
		})

		const res = await request(app).post("/ping").set("Authorization", "valid-key")

		assert.equal(res.status, 200)
		assert.deepEqual(res.body, { pong: true })
	})

	it("returns 401 on /ping when auth rejects", async function () {
		const app = createApp({
			apiKeyHandler: (req, res) => res.status(401).json({})
		})

		const res = await request(app).post("/ping")

		assert.equal(res.status, 401)
		assert.deepEqual(res.body, {})
	})

	it("returns 400 on / when email validation fails", async function () {
		const app = createApp({
			apiKeyHandler: (req, res, next) => {
				req.api_key = "valid-key"
				next()
			},
			usageHandler: (req, res, next) => next()
		})

		const res = await request(app).post("/").send({
			email: "not-an-email"
		})

		assert.equal(res.status, 400)
		assert.deepEqual(res.body, { error: "email_invalid" })
	})

	it("returns 402 on / when usage middleware denies the request", async function () {
		const app = createApp({
			apiKeyHandler: (req, res, next) => {
				req.api_key = "valid-key"
				next()
			},
			usageHandler: (req, res) => res.status(402).json({ error: "limit" })
		})

		const res = await request(app).post("/").send({
			email: "user@gmail.com"
		})

		assert.equal(res.status, 402)
		assert.deepEqual(res.body, { error: "limit" })
	})

	it("returns the process payload on / and trims optional fields", async function () {
		const app = createApp({
			apiKeyHandler: (req, res, next) => {
				req.api_key = "valid-key"
				next()
			},
			usageHandler: (req, res, next) => next(),
			processHandler: (req, res) => {
				return res.json({
					payload: req.ctx.payload
				})
			}
		})

		const res = await request(app).post("/").send({
			email: " user@gmail.com ",
			ip: " 1.2.3.4 ",
			user_agent: " curl/8.0 "
		})

		assert.equal(res.status, 200)
		assert.deepEqual(res.body, {
			payload: {
				email: "user@gmail.com",
				ip: "1.2.3.4",
				user_agent: "curl/8.0"
			}
		})
	})
})
