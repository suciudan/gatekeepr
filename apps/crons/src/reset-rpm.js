import  "@repo/core/dotenv"

import redis from "@repo/core/redis"
import knex from "@repo/db/knex"

const rpmNextReset = knex.raw("DATE_ADD(NOW(), INTERVAL 1 MONTH)")

const users = await knex("user")
	.where("disabled", 0)
	.andWhere("rpmNextReset", "<=", knex.fn.now())
	.orderBy("rpmNextReset", "asc")

if(users.length === 0) process.exit()

const pipeline = redis.pipeline()

for(let i = 0; i < users.length; i++) {
	const user = users[i]
	pipeline.set(`api_usage:${user.apiKey}`, user.rpm)
}
await pipeline.exec()

await knex.transaction(async trx => {
	const ids = users.map(u => u.id)
	await trx("user")
		.whereIn("id", ids)
		.update({ rpmNextReset })
})

process.exit()