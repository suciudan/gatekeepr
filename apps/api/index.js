import "@repo/core/dotenv"

import { rateLimit } from "express-rate-limit"
import { RedisStore } from "rate-limit-redis"

import redis from "@repo/core/redis"

import { createApp } from "./src/app.js"

const port = process.env.PORT || 3000
const beforeRoutes = []

if(process.env.NODE_ENV === "production") {
	beforeRoutes.push(rateLimit({
		windowMs: 10 * 1000,
		limit: 10000,
		standardHeaders: "draft-8",
		legacyHeaders: false,
		store: new RedisStore({
			sendCommand: (command, ...args) =>
				redis.send_command(command, ...args),
		}),
	}))
}

const app = createApp({ beforeRoutes })

app.listen(port, () => {
	console.log(`App listening on http://localhost:${port}`)
})

