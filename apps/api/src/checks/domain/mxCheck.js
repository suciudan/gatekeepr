import { measurePerformance } from "@repo/core/performance"
import redis, { jsonGet, jsonSetWithEx } from "@repo/core/redis"
import { md5 } from "@repo/core/crypto"
import logger from "@repo/core/logger"
import {
	DISPOSABLE_MX_HOSTS_KEY,
	DISPOSABLE_MX_IPV4_KEY,
	DISPOSABLE_MX_IPV6_KEY
} from "@repo/core/disposable-domains"
import { getDomainMxSnapshot } from "@repo/core/whois"

import { HOUR_IN_SECONDS } from "@repo/config/constants"
import { persistDisposableMxDiscoveredDomain } from "../../libs/disposable-domain-discovery.js"

function normalizeValues(values) {
	return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))]
		.sort((left, right) => left.localeCompare(right))
}

function collectMxSnapshotMatches(mxSnapshot) {
	return {
		hosts: normalizeValues([
			...(mxSnapshot?.mxRecords || []).map(record => record.exchange),
			...(mxSnapshot?.mxResolvedRecords || []).map(record => record.exchange)
		]),
		ipv4: normalizeValues((mxSnapshot?.mxResolvedRecords || []).flatMap(record => record.ipv4 || [])),
		ipv6: normalizeValues((mxSnapshot?.mxResolvedRecords || []).flatMap(record => record.ipv6 || []))
	}
}

async function findSetMatches(redisClient, key, values) {
	const candidates = normalizeValues(values)
	if(candidates.length === 0) return []

	const pipeline = redisClient.pipeline()
	for(const value of candidates) {
		pipeline.sismember(key, value)
	}

	const results = await pipeline.exec()
	return candidates.filter((value, index) => {
		const [error, isMember] = results[index] || []
		if(error) return false
		return isMember === 1 || isMember === "1"
	})
}

export async function matchDisposableMxSnapshot(redisClient, mxSnapshot) {
	const candidates = collectMxSnapshotMatches(mxSnapshot)
	const [hosts, ipv4, ipv6] = await Promise.all([
		findSetMatches(redisClient, DISPOSABLE_MX_HOSTS_KEY, candidates.hosts),
		findSetMatches(redisClient, DISPOSABLE_MX_IPV4_KEY, candidates.ipv4),
		findSetMatches(redisClient, DISPOSABLE_MX_IPV6_KEY, candidates.ipv6)
	])

	return {
		hosts,
		ipv4,
		ipv6
	}
}

export const createDomainMxCheck = ({
	jsonGetFn = jsonGet,
	jsonSetWithExFn = jsonSetWithEx,
	getDomainMxSnapshotFn = getDomainMxSnapshot,
	matchDisposableMxFn = (mxSnapshot) => matchDisposableMxSnapshot(redis, mxSnapshot),
	persistDisposableMxDomainFn = persistDisposableMxDiscoveredDomain,
	md5Fn = md5,
	loggerFn = logger
} = {}) => {
	const cachedResolveMxSnapshot = async (domain) => {
		const cacheKey = `cache_mx_snapshot_v1_${md5Fn(domain)}`
		const cache = await jsonGetFn(cacheKey)
		if(cache && Array.isArray(cache?.mxRecords) && Array.isArray(cache?.mxResolvedRecords)) return cache

		try {
			const mxSnapshot = await getDomainMxSnapshotFn(domain, {
				includeResolved: true
			})
			await jsonSetWithExFn(cacheKey, mxSnapshot, HOUR_IN_SECONDS)
			return mxSnapshot
		} catch(error) {
			throw error
		}
	}

	return async function domainMxCheck(ctx) {
		if(ctx.info.email_known_provider) return
		if(ctx.threats.includes("email_disposable")) return

		let start

		if(measurePerformance()) start = performance.now()

		const { email } = ctx.payload
		const domain = email.split("@")[1]

		try {
			const mxSnapshot = await cachedResolveMxSnapshot(domain)

			if(mxSnapshot.mxRecords.length === 0) {
				ctx.threats.push("domain_no_mx")
				if(measurePerformance()) ctx.performance.domain_no_mx = performance.now() - start
				return
			}

			const disposableMatches = await matchDisposableMxFn(mxSnapshot)
			if(disposableMatches.hosts.length || disposableMatches.ipv4.length || disposableMatches.ipv6.length) {
				ctx.threats.push("domain_mx_disposable_infra")
				if(!ctx.threats.includes("email_disposable")) ctx.threats.push("email_disposable")
				if(disposableMatches.hosts.length) ctx.info.domain_mx_disposable_hosts = disposableMatches.hosts
				if(disposableMatches.ipv4.length) ctx.info.domain_mx_disposable_ipv4 = disposableMatches.ipv4
				if(disposableMatches.ipv6.length) ctx.info.domain_mx_disposable_ipv6 = disposableMatches.ipv6
				try {
					await persistDisposableMxDomainFn({
						domain,
						mxSnapshot,
						matches: disposableMatches
					})
				} catch(error) {
					await loggerFn(`domain-mx_disposable_persist: ${error.message} (${domain})`, process.env.SLACK_ERRORS_API)
				}
				if(measurePerformance()) ctx.performance.domain_mx_disposable_infra = performance.now() - start
				return
			}

			ctx.trust.push("domain_with_mx")
			if(measurePerformance()) ctx.performance.domain_with_mx = performance.now() - start
		} catch(error) {
			await loggerFn(`domain-mx_check: ${error.message} (${domain})`, process.env.SLACK_ERRORS_API)
			ctx.threats.push("domain_mx_check_error")
			if(measurePerformance()) ctx.performance.domain_mx_check_error = performance.now() - start
		}
	}
}

export const domainMxCheck = createDomainMxCheck()
