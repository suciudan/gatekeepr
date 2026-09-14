import "@repo/core/dotenv"

import { storeIPv4Cidrs } from "@repo/core/ipv4"
import { storeIPv6Cidrs } from "@repo/core/ipv6"
import logger from "@repo/core/logger"

const ipType = process.argv[2]

if(!ipType) {
	console.log("Please specify the IP type (ipv4|ipv6)")
	process.exit()
}

const version = ipType === "ipv4" ? "v4" : "v6"
const results = []

try {
	const res = await fetch(`https://www.spamhaus.org/drop/drop_${version}.json`)
	const text = await res.text()
	const rows = text.split("\n")
	for(let i = 0 ; i < rows.length; i++) {
		const row = rows[i]
		if(row === "") continue
		const json = JSON.parse(row)
		if(!json || !json.cidr) continue
		results.push(json.cidr)
	}
	
	let cacheRes
	
	if(version === "v4") {
		cacheRes = await storeIPv4Cidrs(`spamhaus_${ipType}`, results)
	} else {
		cacheRes = await storeIPv6Cidrs(`spamhaus_${ipType}`, results)
	}
	
	await logger(`spamhaus: the list has been successfully refreshed.`, process.env.SLACK_STATUS_CRON)
	
} catch(err) {
	await logger(`spamhaus: ${err.message}`, process.env.SLACK_ERRORS_CRON)
}

process.exit()