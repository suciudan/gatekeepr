import "@repo/core/dotenv"

import logger from "@repo/core/logger"
import redis from "@repo/core/redis"
import knex from "@repo/db/knex"

import { loadDisposablePackageArtifacts, publishDisposableDomains } from "./libs/disposable-publisher.js"

const dryRun = process.argv.includes("--dry-run")

try {
	const artifacts = await loadDisposablePackageArtifacts(redis)
	const result = await publishDisposableDomains({
		artifacts,
		dryRun,
		loggerFn: logger
	})
	if(result.status === "dry_run") {
		await logger(`disposable-publish: dry run prepared version ${result.version}`, process.env.SLACK_STATUS_CRON)
	}
} catch(error) {
	await logger(`disposable-publish: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	process.exitCode = 1
} finally {
	try {
		await redis.quit()
	} catch {}
	try {
		await knex.destroy()
	} catch {}
}
