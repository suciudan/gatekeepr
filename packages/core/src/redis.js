import Redis from "ioredis"

const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379")

export default redis

export const jsonGet = async (key) => {
	const json = await redis.call("JSON.GET", key)
	return json ? JSON.parse(json) : null
}

export const jsonSet = async (key, value) => {
	return redis.call("JSON.SET", key, "$", JSON.stringify(value))
}

export const jsonSetWithEx = async (key, value, ex) => {
	await jsonSet(key, value)
	await redis.call("EXPIRE", key, ex)
}

export const setWithEx = async (key, value, ex) => {
	await redis.set(key, value, "EX", ex)
}
