import dns from "dns/promises"

import {
	clearDisposableMxRefreshSchedule,
	selectDisposableShardDomains,
	sortDisposableDomains
} from "@repo/core/disposable-domains"
import { getDomainMxSnapshot } from "@repo/core/whois"

const DEFAULT_FAILURE_EXAMPLE_LIMIT = 10

function normalizePositiveInteger(value, fallback) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeNonNegativeInteger(value, fallback = 0) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function normalizeString(value) {
	return typeof value === "string" ? value.trim() : ""
}

async function mapWithConcurrency(values, concurrency, mapper) {
	const items = Array.isArray(values) ? values : []
	if(items.length === 0) return []

	const safeConcurrency = normalizePositiveInteger(concurrency, 1)
	const results = new Array(items.length)
	let nextIndex = 0

	async function worker() {
		while(nextIndex < items.length) {
			const index = nextIndex++
			results[index] = await mapper(items[index], index)
		}
	}

	await Promise.all(Array.from({
		length: Math.min(safeConcurrency, items.length)
	}, () => worker()))
	return results
}

export function parseDnsServers(value) {
	if(Array.isArray(value)) {
		return value.map(normalizeString).filter(Boolean)
	}
	return normalizeString(value)
		.split(",")
		.map(normalizeString)
		.filter(Boolean)
}

export function createDnsResolveFns({
	dnsServers = [],
	resolveMxFn = dns.resolveMx,
	resolve4Fn = dns.resolve4,
	resolve6Fn = dns.resolve6
} = {}) {
	const servers = parseDnsServers(dnsServers)
	if(servers.length === 0) {
		return {
			dnsServers: [],
			resolveMxFn,
			resolve4Fn,
			resolve6Fn
		}
	}

	const resolver = new dns.Resolver()
	resolver.setServers(servers)

	return {
		dnsServers: servers,
		resolveMxFn: resolver.resolveMx.bind(resolver),
		resolve4Fn: resolver.resolve4.bind(resolver),
		resolve6Fn: resolver.resolve6.bind(resolver)
	}
}

export function createCachedAddressResolveFns({
	resolve4Fn = dns.resolve4,
	resolve6Fn = dns.resolve6
} = {}) {
	const ipv4Cache = new Map()
	const ipv6Cache = new Map()
	const stats = {
		ipv4Lookups: 0,
		ipv4CacheHits: 0,
		ipv6Lookups: 0,
		ipv6CacheHits: 0
	}

	function getCached(cache, hostname, lookupFn, lookupKey, hitKey) {
		const normalizedHostname = normalizeString(hostname).toLowerCase()
		if(cache.has(normalizedHostname)) {
			stats[hitKey] += 1
			return cache.get(normalizedHostname)
		}

		stats[lookupKey] += 1
		const promise = Promise.resolve().then(() => lookupFn(normalizedHostname))
		cache.set(normalizedHostname, promise)
		return promise
	}

	return {
		resolve4Fn: hostname => getCached(ipv4Cache, hostname, resolve4Fn, "ipv4Lookups", "ipv4CacheHits"),
		resolve6Fn: hostname => getCached(ipv6Cache, hostname, resolve6Fn, "ipv6Lookups", "ipv6CacheHits"),
		stats,
		clear() {
			ipv4Cache.clear()
			ipv6Cache.clear()
		}
	}
}

export function selectDisposableMxFullRefreshDomains(domains, {
	shardCount = 1,
	shardIndex = 0,
	resumeAfter = null,
	limit = 0
} = {}) {
	const shardDomains = selectDisposableShardDomains(sortDisposableDomains(domains), {
		shardCount,
		shardIndex
	})
	const normalizedResumeAfter = normalizeString(resumeAfter).toLowerCase()
	const selectedDomains = normalizedResumeAfter
		? shardDomains.filter(domain => domain.localeCompare(normalizedResumeAfter) > 0)
		: shardDomains
	const safeLimit = normalizeNonNegativeInteger(limit, 0)

	return safeLimit > 0 ? selectedDomains.slice(0, safeLimit) : selectedDomains
}

export function applyDisposableMxSnapshot(profile, mxSnapshot) {
	return clearDisposableMxRefreshSchedule({
		...profile,
		mxRecords: Array.isArray(mxSnapshot?.mxRecords) ? mxSnapshot.mxRecords : [],
		mxResolvedAt: mxSnapshot?.mxResolvedAt || null,
		mxResolvedRecords: Array.isArray(mxSnapshot?.mxResolvedRecords) ? mxSnapshot.mxResolvedRecords : []
	})
}

export async function refreshDisposableMxProfile(profile, {
	getDomainMxSnapshotFn = getDomainMxSnapshot,
	resolveMxFn,
	resolve4Fn,
	resolve6Fn,
	mxTimeoutMs,
	ipTimeoutMs,
	resolveConcurrency,
	now = new Date()
} = {}) {
	if(!profile?.domain || profile.isDisposable === false) {
		return {
			domain: profile?.domain || null,
			success: false,
			skipped: true,
			profile: null,
			error: null
		}
	}

	try {
		const mxSnapshot = await getDomainMxSnapshotFn(profile.domain, {
			includeResolved: true,
			resolveMxFn,
			resolve4Fn,
			resolve6Fn,
			mxTimeoutMs,
			ipTimeoutMs,
			resolveConcurrency,
			now
		})

		return {
			domain: profile.domain,
			success: true,
			skipped: false,
			profile: applyDisposableMxSnapshot(profile, mxSnapshot),
			error: null
		}
	} catch(error) {
		return {
			domain: profile.domain,
			success: false,
			skipped: false,
			profile: null,
			error
		}
	}
}

export async function refreshDisposableMxProfiles(profiles, {
	concurrency = 10,
	failureExampleLimit = DEFAULT_FAILURE_EXAMPLE_LIMIT,
	progressFn = null,
	...options
} = {}) {
	const items = Array.isArray(profiles) ? profiles : []
	const progress = {
		total: items.length,
		completed: 0,
		succeeded: 0,
		failed: 0,
		skipped: 0
	}
	const results = await mapWithConcurrency(items, concurrency, async profile => {
		const result = await refreshDisposableMxProfile(profile, options)
		progress.completed += 1
		if(result.success) progress.succeeded += 1
		else if(result.skipped) progress.skipped += 1
		else progress.failed += 1
		if(progressFn) {
			await progressFn({
				...progress,
				domain: result.domain,
				success: result.success,
				skipped: result.skipped
			})
		}
		return result
	})
	const failureExamples = results
		.filter(result => !result.success && !result.skipped)
		.slice(0, normalizePositiveInteger(failureExampleLimit, DEFAULT_FAILURE_EXAMPLE_LIMIT))
		.map(result => ({
			domain: result.domain,
			error: result.error?.message || String(result.error || "Unknown error")
		}))

	return {
		results,
		profilesToSave: results
			.filter(result => result.success && result.profile)
			.map(result => result.profile),
		succeeded: results.filter(result => result.success).length,
		failed: results.filter(result => !result.success && !result.skipped).length,
		skipped: results.filter(result => result.skipped).length,
		failureExamples
	}
}
