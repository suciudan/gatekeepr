import dns from "dns/promises"

import { measurePerformance } from "@repo/core/performance"
import { DAY_IN_SECONDS } from "@repo/config/constants"
import redis, { setWithEx } from "@repo/core/redis"
import { md5 } from "@repo/core/crypto"
import logger from "@repo/core/logger"

export const expandIPv6 = (ipv6) => {
	const sections = ipv6.split("::")
	let left = [], right = []
	if(sections.length === 1) {
		left = sections[0].split(":")
	} else {
		left = sections[0] ? sections[0].split(":") : []
		right = sections[1] ? sections[1].split(":") : []
		const fill = new Array(8 - (left.length + right.length)).fill("0")
		left = [...left, ...fill, ...right]
	}
	return left.map(part => part.padStart(4, "0")).join("")
}

export const createIpProviderCheck = ({
	resolveTxt = dns.resolveTxt,
	redisClient = redis,
	setWithExFn = setWithEx,
	md5Fn = md5,
	loggerFn = logger
} = {}) => {
	const dig = async (command) => {
		const cacheKey = `cache_dig_${md5Fn(command)}`
		const cached = await redisClient.get(cacheKey)
		if(cached) return cached
		try {
			const res = await resolveTxt(command)
			const row = res[0][0]
			const parts = row.split("|")
			const value = parts[0].trim()
			await setWithExFn(cacheKey, value, DAY_IN_SECONDS)
			return value
		} catch (err) {
			await loggerFn(`ip-provider-dig: ${err.message} (${command})`, process.env.SLACK_ERRORS_API)
			return false
		}
	}

	const processIpv4 = async (ip) => {
		const reversed = ip.trim().split(".").reverse().join(".")
		return dig(`${reversed}.origin.asn.cymru.com`)
	}

	const processIpv6 = async (ip) => {
		const expandedHex = expandIPv6(ip)
		const reversed = expandedHex.split("").reverse().join(".")
		return dig(`${reversed}.origin6.asn.cymru.com`)
	}

	return async function ipProviderCheck(ctx) {
		const { ip } = ctx.payload

		if(!ip) return
		if(ctx.info.ip_private) return

		let asnNumber = null
		let start

		if(measurePerformance()) start = performance.now()

		if(ctx.info.ipv4) asnNumber = await processIpv4(ip)
		if(ctx.info.ipv6) asnNumber = await processIpv6(ip)

		if(!asnNumber) {
			ctx.threats.push("ip_asn_lookup_error")
			if(measurePerformance()) ctx.performance.ip_asn_lookup_error = performance.now() - start
			return
		}

		const todayTag = await redisClient.get("asn_current_set")
		const asn = await redisClient.hgetall(`asn_${todayTag}_${asnNumber}`)

		if(Object.keys(asn).length === 0) {
			ctx.threats.push("ip_asn_not_found")
			if(measurePerformance()) ctx.performance.ip_asn_not_found = performance.now() - start
			return
		}

		ctx.info.asn = asn.name
		ctx.info.asn_number = asnNumber

		if([
			"Content", "Enterprise", "NSP"
		].includes(asn.info_type)) {
			const key = "ip_asn_datacenter"
			ctx.threats.push(key)
			ctx.info.asn_type = asn.info_type
			if(measurePerformance()) ctx.performance[key] = performance.now() - start
		} else {
			const key = "ip_asn_residential"
			ctx.info.asn_type = asn.info_type ?? "-"
			ctx.trust.push(key)
			if(measurePerformance()) ctx.performance[key] = performance.now() - start
		}
	}
}

export const ipProviderCheck = createIpProviderCheck()
