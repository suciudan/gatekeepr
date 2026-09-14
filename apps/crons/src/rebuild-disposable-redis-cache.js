import "@repo/core/dotenv"

import redis from "@repo/core/redis"
import knex from "@repo/db/knex"

import {
	listDisposableDomains,
	loadDisposableProfiles,
	rebuildDisposableRedisCache
} from "./libs/disposable-emails.js"

try {
	const domains = await listDisposableDomains()
	const profiles = await loadDisposableProfiles(redis, domains)
	console.log(JSON.stringify(await rebuildDisposableRedisCache(redis, {
		domains,
		profiles
	}), null, 2))
} finally {
	try {
		await redis.quit()
	} catch {}
	try {
		await knex.destroy()
	} catch {}
}
