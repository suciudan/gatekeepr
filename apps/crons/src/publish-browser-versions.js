import "@repo/core/dotenv"

import logger from "@repo/core/logger"
import redis from "@repo/core/redis"

import {
	loadBrowserVersionDataset,
	publishBrowserVersions
} from "./libs/browser-version-publisher.js"

const dryRun = process.argv.includes("--dry-run")

try {
	const dataset = await loadBrowserVersionDataset(redis)
	const result = await publishBrowserVersions({
		dataset,
		dryRun,
		loggerFn: logger
	})
	if(result.status === "dry_run") {
		await logger(`browser-versions-publish: dry run prepared version ${result.version}`, process.env.SLACK_STATUS_CRON)
	}
} catch(error) {
	await logger(`browser-versions-publish: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	process.exitCode = 1
} finally {
	try {
		await redis.quit()
	} catch {}
}

process.exit(process.exitCode || 0)
