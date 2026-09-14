import "@repo/core/dotenv"

import isIPRange from "validator/lib/isIPRange.js"
import pLimit from "p-limit"

import { storeIPv4Cidrs } from "@repo/core/ipv4"
import { storeIPv6Cidrs } from "@repo/core/ipv6"
import logger from "@repo/core/logger"

const limit = pLimit(2)
const links = [
	"https://www.cloudflare.com/ips-v4",
	"https://www.cloudflare.com/ips-v6"
]

const promises = []
const ips = []

for(let i = 0; i < links.length; i++) {
	const link = links[i]
	promises.push(limit(async () => {
		try {
			const list = await fetch(link)
			const text = await list.text()
			const rows = text.split("\n").filter(line => line !== "")
			ips.push(...rows)
			
		} catch(err) {
			await logger(`cloudflare: ${err.message} (${link})`, process.env.SLACK_ERRORS_CRON)
		}
	}))
}

await Promise.all(promises)

if(ips.length === 0) process.exit()

const ipv4 = []
const ipv6 = []

for(let i = 0; i < ips.length; i++) {
	const ip = ips[i]
	if(isIPRange(ip, { version: 4 })) {
		ipv4.push(ip)
	} else if(isIPRange(ip, { version: 6 })) {
		ipv6.push(ip)
	}
}

await storeIPv4Cidrs("cloudflare_ipv4", ipv4)
await storeIPv6Cidrs("cloudflare_ipv6", ipv6)

await logger(`cloudflare: the list has been successfully refreshed.`, process.env.SLACK_STATUS_CRON)

process.exit()
