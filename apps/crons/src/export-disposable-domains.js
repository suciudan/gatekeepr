import "@repo/core/dotenv"

import logger from "@repo/core/logger"
import redis from "@repo/core/redis"
import knex from "@repo/db/knex"

import { writeDisposableExportFiles } from "./libs/disposable-export.js"

try {
	console.log(JSON.stringify(await writeDisposableExportFiles(redis), null, 2))
} catch(error) {
	await logger(`disposable-export: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	process.exitCode = 1
} finally {
	try {
		await redis.quit()
	} catch {}
	try {
		await knex.destroy()
	} catch {}
}
