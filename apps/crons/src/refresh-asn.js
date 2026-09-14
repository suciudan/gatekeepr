import  "@repo/core/dotenv"

import logger from "@repo/core/logger"
import redis from "@repo/core/redis"

import { createTodayTag } from "./libs/date.js"

const todayTag = createTodayTag()

const keyPrefix = `asn_${todayTag}_`

let data = []

try {
	const res = await fetch("https://www.peeringdb.com/api/net", {
		method: "GET",
		headers: {
			"Accept": "application/json",
			"Authorization": `Api-Key ${process.env.PEERDB_API_KEY}`
		}
	})
	const json = await res.json()
	data = json.data
} catch(err) {
	await logger(
		`asn: error while fetching the net list from PeeringDB (${err.message})`,
		process.env.SLACK_ERRORS_CRON
	)
	process.exit()
}

const pipeline = redis.pipeline()

for(const entry of data) {
	const asn = entry.asn
	const redisKey = `${keyPrefix}${asn}`
	pipeline.hset(redisKey, {
		info_type: entry.info_type || "",
		name: entry.name || "",
		website: entry.website || ""
	})
}

await pipeline.exec()

const previousTag = await redis.get("asn_current_set")
await redis.set("asn_current_set", todayTag)

if(previousTag && previousTag !== todayTag) {
	const oldKeys = await redis.keys(`asn_${previousTag}_*`);
	if(oldKeys.length > 0) {
		await redis.del(...oldKeys)
	}
}

await logger(`asn: the list has been successfully refreshed.`, process.env.SLACK_STATUS_CRON)
process.exit()