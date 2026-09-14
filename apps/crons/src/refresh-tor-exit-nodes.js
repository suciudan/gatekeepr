import "@repo/core/dotenv"

import { storeIPv4Batch } from "@repo/core/ipv4"
import logger from "@repo/core/logger"

try {
	const list = await fetch("https://www.dan.me.uk/torlist")
	const text = await list.text()
	const rows = text.split("\n").filter(line => line !== "")
	await storeIPv4Batch("tor_exit_nodes", rows)
	await logger(`tor: the list has been successfully refreshed.`, process.env.SLACK_STATUS_CRON)
} catch(err) {
	await logger(`tor: ${err.message}`, process.env.SLACK_ERRORS_CRON)
}

process.exit()