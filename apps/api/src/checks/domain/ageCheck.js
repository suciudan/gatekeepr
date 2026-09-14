import moment from "moment"

import { measurePerformance } from "@repo/core/performance"
import { jsonGet, jsonSetWithEx } from "@repo/core/redis"
import { getDomainInfo } from "@repo/core/whois"
import { md5 } from "@repo/core/crypto"
import logger from "@repo/core/logger"

import { HOUR_IN_SECONDS } from "@repo/config/constants"

export const createDomainAgeCheck = ({
	jsonGetFn = jsonGet,
	jsonSetWithExFn = jsonSetWithEx,
	getDomainInfoFn = getDomainInfo,
	md5Fn = md5,
	loggerFn = logger,
	nowFactory = () => moment()
} = {}) => {
	const cachedWhoisDomain = async (domain) => {
		const cacheKey = `cache_whois_${md5Fn(domain)}`
		const cached = await jsonGetFn(cacheKey)
		if(cached) return cached
		try {
			const domainWhois = await getDomainInfoFn(domain)
			await jsonSetWithExFn(cacheKey, domainWhois, HOUR_IN_SECONDS)
			return domainWhois
		} catch(error) {
			throw error
		}
	}

	return async function domainAgeCheck(ctx) {
		if(ctx.info.email_known_provider) return

		let start

		if(measurePerformance()) start = performance.now()

		const { email } = ctx.payload
		const domain = email.split("@")[1]

		let domainWhois

		try {
			domainWhois = await cachedWhoisDomain(domain)
		} catch(err) {
			await loggerFn(`domain-ageCheck-whois: ${err.message}`, process.env.SLACK_ERRORS_API)
			ctx.threats.push("domain_whois_error")
			if(measurePerformance()) ctx.performance.domain_whois_error = performance.now() - start
			ctx.halt = true
			return
		}

		if(!domainWhois.creation && !domainWhois.expiration) {
			ctx.threats.push("domain_unregistered")
			if(measurePerformance()) ctx.performance.domain_unregistered = performance.now() - start
			ctx.halt = true
			return
		}

		const createdDate = moment(domainWhois.creation)
		const expiryDate = moment(domainWhois.expiration)
		const now = nowFactory()

		if(domainWhois.expiration && expiryDate.isValid() && expiryDate.isSameOrBefore(now)) {
			ctx.threats.push("domain_expired")
			if(measurePerformance()) ctx.performance.domain_expired = performance.now() - start
			ctx.halt = true
		} else if(createdDate.isValid() && now.diff(createdDate, "days") <= 7) {
			if(measurePerformance()) ctx.performance.domain_fresh = performance.now() - start
			ctx.threats.push("domain_fresh")
		} else {
			if(measurePerformance()) ctx.performance.domain_settled = performance.now() - start
			ctx.trust.push("domain_settled")
		}
	}
}

export const domainAgeCheck = createDomainAgeCheck()
