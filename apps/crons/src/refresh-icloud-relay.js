import "@repo/core/dotenv"

import isIPRange from "validator/lib/isIPRange.js"

import { storeIPv4Cidrs } from "@repo/core/ipv4"
import { storeIPv6Cidrs } from "@repo/core/ipv6"
import logger from "@repo/core/logger"

const ipv4 = []
const ipv6 = []

try {
	
	const list = await fetch("https://mask-api.icloud.com/egress-ip-ranges.csv")
	const text = await list.text()
	const rows = text.split("\n").filter(line => line !== "")
	
	for(let i = 0; i < rows.length; i++) {
		const row = rows[i]
		const ip = row.split(",")[0]
		if(isIPRange(ip, { version: 4 })) {
			ipv4.push(ip)
		} else if(isIPRange(ip, { version: 6 })) {
			ipv6.push(ip)
		}
	}
	
	await storeIPv4Cidrs("icloud_relay_ipv4", ipv4)
	await storeIPv6Cidrs("icloud_relay_ipv6", ipv6)
	
	await logger(`icloud: the list has been successfully refreshed.`, process.env.SLACK_STATUS_CRON)
	
} catch(err) {
	await logger(`icloud: ${err.message}`, process.env.SLACK_ERRORS_CRON)
}

process.exit()