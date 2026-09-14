import "@repo/core/dotenv"

import { storeIPv4Batch } from "@repo/core/ipv4"
import logger from "@repo/core/logger"

try {
	const list = await fetch("https://blocklist.net.ua/blocklist.csv")
	const text = await list.text()
	const rows = text.split("\n")
	const results = []
	for(let i = 0; i < rows.length; i++) {
		if(i === 0) continue
		const row = rows[i]
		if(row === "") continue
		const ipAddress = row.split(";")[0]
		results.push(ipAddress)
	}
	const res = await storeIPv4Batch("blocklist_ua", results)
	await logger(`blocklist-ua: the list has been successfully refreshed.`, process.env.SLACK_STATUS_CRON)
} catch(err) {
	await logger(`blocklist-ua: ${err.message}`, process.env.SLACK_ERRORS_CRON)
}
process.exit()