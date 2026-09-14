import "@repo/core/dotenv"

import { storeIPv4Cidrs } from "@repo/core/ipv4"
import { storeIPv6Cidrs } from "@repo/core/ipv6"
import logger from "@repo/core/logger"

const ipv4 = []
const ipv6 = []

try {
	
	const list = await fetch("https://ip-ranges.amazonaws.com/ip-ranges.json")
	const json = await list.json()
	
	const { prefixes, ipv6_prefixes } = json
	
	for(let i = 0; i < prefixes.length; i++) {
		ipv4.push(prefixes[i].ip_prefix)
	}
	
	for(let i = 0; i < ipv6_prefixes.length; i++) {
		ipv6.push(ipv6_prefixes[i].ipv6_prefix)
	}
	
	await storeIPv4Cidrs("aws_ipv4", ipv4)
	await storeIPv6Cidrs("aws_ipv6", ipv6)
	
	await logger(`aws: the list has been successfully refreshed.`, process.env.SLACK_STATUS_CRON)
	
} catch(err) {
	await logger(`aws: ${err.message}`, process.env.SLACK_ERRORS_CRON)
}

process.exit()