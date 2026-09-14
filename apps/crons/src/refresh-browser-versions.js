import "@repo/core/dotenv"

import logger from "@repo/core/logger"
import redis from "@repo/core/redis"
import {
	fetchBrowserVersionsDataset,
	saveBrowserVersions
} from "@repo/core/browser-versions"

import {
	publishBrowserVersions
} from "./libs/browser-version-publisher.js"

const publishDryRun = process.argv.includes("--dry-run")

try {
	const dataset = await fetchBrowserVersionsDataset({
		loggerFn: logger
	})
	if(Object.keys(dataset.browsers).length === 0) {
		throw new Error("No browser versions were refreshed from upstream sources.")
	}
	await saveBrowserVersions(dataset, {
		redisClient: redis
	})
	const publishResult = await publishBrowserVersions({
		dataset,
		dryRun: publishDryRun,
		loggerFn: logger
	})

	await logger(
		`browser-versions: refreshed ${Object.keys(dataset.browsers).length} browsers, publish ${publishResult.status}${publishResult.version ? ` ${publishResult.version}` : ""}.`,
		process.env.SLACK_STATUS_CRON
	)
} catch(error) {
	await logger(`browser-versions: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	process.exitCode = 1
} finally {
	try {
		await redis.quit()
	} catch {}
}

process.exit(process.exitCode || 0)
