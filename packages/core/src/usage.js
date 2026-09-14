import moment from "moment"

import { REQUESTS_FREE_PACKAGE } from "@repo/config/constants"

import logger from "./logger.js"
import redis from "./redis.js"

export const logUsage = async (apiKey) => {
	
	const now = moment().utc()
	
	const hourKey = `api_usage:${apiKey}:${now.format("YYYYMMDDHH")}`
	const dayKey = `api_usage:${apiKey}:${now.format("YYYYMMDD")}`
	const usageKey = `api_usage:${apiKey}`
	
	const pipeline = redis.pipeline()
	
	pipeline.incr(hourKey)
	pipeline.incr(dayKey)
	pipeline.decr(usageKey)
	
	try {
		await pipeline.exec()
	} catch(err) {
		await logger(`usage: ${err.message} (${apiKey})`, process.env.SLACK_ERRORS_API)
	}
	
}

/**
 * Check if the user has requests left
 * @param apiKey
 * @returns {Promise<boolean>}
 */

export const checkUsage = async (apiKey) => {
	const usage = await redis.get(`api_usage:${apiKey}`)
	if(usage === null) {
		await redis.set(`api_usage:${apiKey}`, REQUESTS_FREE_PACKAGE)
		return true
	}
	return usage > 0
}

/**
 * Return the usage for an API Key
 * @param apiKey
 * @returns {Promise<{"1H": number, "24H": *, "30D": *}|{"1H": number, "24H": number, "30D": number}>}
 */

export const getUsage = async (apiKey) => {
	
	if(!apiKey) return { "1H": 0, "24H": 0, "30D": 0, "LFT": REQUESTS_FREE_PACKAGE }
	
	const now = moment().utc()
	
	// Usage left
	const usageLeft = await redis.get(`api_usage:${apiKey}`) || REQUESTS_FREE_PACKAGE
	
	// 1H: Current hour
	const key1H = `api_usage:${apiKey}:${now.format("YYYYMMDDHH")}`
	const count1H = parseInt(await redis.get(key1H) || "0", 10)
	
	// 24H: Sum of last 24 hours
	const keys24H = []
	for(let i = 0; i < 24; i++) {
		const hourKey = `api_usage:${apiKey}:${now.clone().subtract(i, "hour").format("YYYYMMDDHH")}`
		keys24H.push(hourKey)
	}
	
	const counts24H = await redis.mget(...keys24H)
	const count24H = counts24H.reduce((sum, val) => sum + parseInt(val || "0", 10), 0)
	
	// 30D: Sum of last 30 days
	const keys30D = []
	for(let i = 0; i <= 30; i++) {
		const dayKey = `api_usage:${apiKey}:${now.clone().subtract(i, "day").format("YYYYMMDD")}`
		keys30D.push(dayKey)
	}
	const counts30D = await redis.mget(...keys30D)
	const count30D = counts30D.reduce((sum, val) => sum + parseInt(val || "0", 10), 0)
	
	return {
		"LFT": usageLeft,
		"1H": count1H,
		"24H": count24H,
		"30D": count30D
	}
	
}