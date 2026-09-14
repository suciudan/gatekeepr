import {
	DISPOSABLE_EMAILS_KEY,
	DISPOSABLE_ENRICHMENT_DUE_KEY,
	DISPOSABLE_MX_HOSTS_KEY,
	DISPOSABLE_MX_IPV4_KEY,
	DISPOSABLE_MX_IPV6_KEY,
	DISPOSABLE_MX_REFRESH_DUE_KEY,
	createDisposableMxInfrastructureProfile,
	getDisposableProfileKey,
	isDisposableMxInfrastructureIp,
	normalizeDisposableDomain,
	normalizeDisposableMxInfrastructureHost
} from "@repo/core/disposable-domains"
import redis from "@repo/core/redis"
import knex from "@repo/db/knex"
import {
	loadDisposableProfilesFromDb,
	upsertDisposableProfilesToDb
} from "@repo/db/disposable-domain-profiles"

function sortUnique(values) {
	return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))]
		.sort((left, right) => left.localeCompare(right))
}

function collectDisposableMxIndexValues(profile) {
	const mxRecords = Array.isArray(profile?.mxRecords) ? profile.mxRecords : []
	const mxResolvedRecords = Array.isArray(profile?.mxResolvedRecords) ? profile.mxResolvedRecords : []
	const mxHosts = sortUnique([
		...mxRecords.map(record => normalizeDisposableMxInfrastructureHost(record?.exchange)),
		...mxResolvedRecords.map(record => normalizeDisposableMxInfrastructureHost(record?.exchange))
	])
	const routableResolvedRecords = mxResolvedRecords
		.filter(record => normalizeDisposableMxInfrastructureHost(record?.exchange))

	return {
		mxHosts,
		mxIpv4: sortUnique(routableResolvedRecords.flatMap(record => record.ipv4 || [])
			.filter(isDisposableMxInfrastructureIp)),
		mxIpv6: sortUnique(routableResolvedRecords.flatMap(record => record.ipv6 || [])
			.filter(isDisposableMxInfrastructureIp))
	}
}

function zaddOrRemove(tx, key, scoreValue, member) {
	const score = Date.parse(scoreValue)
	if(Number.isFinite(score)) {
		tx.zadd(key, score, member)
		return
	}
	tx.zrem(key, member)
}

async function cacheDiscoveredDisposableProfile(redisClient, profile) {
	const indexValues = collectDisposableMxIndexValues(profile)
	const tx = redisClient.multi()

	tx.sadd(DISPOSABLE_EMAILS_KEY, profile.domain)
	tx.call("JSON.SET", getDisposableProfileKey(profile.domain), "$", JSON.stringify(profile))
	zaddOrRemove(tx, DISPOSABLE_ENRICHMENT_DUE_KEY, profile.nextEnrichmentAt, profile.domain)
	zaddOrRemove(tx, DISPOSABLE_MX_REFRESH_DUE_KEY, profile.nextMxRefreshAt, profile.domain)

	if(indexValues.mxHosts.length) tx.sadd(DISPOSABLE_MX_HOSTS_KEY, ...indexValues.mxHosts)
	if(indexValues.mxIpv4.length) tx.sadd(DISPOSABLE_MX_IPV4_KEY, ...indexValues.mxIpv4)
	if(indexValues.mxIpv6.length) tx.sadd(DISPOSABLE_MX_IPV6_KEY, ...indexValues.mxIpv6)

	await tx.exec()
}

export async function persistDisposableMxDiscoveredDomain({
	domain,
	mxSnapshot,
	redisClient = redis,
	db = knex,
	now = new Date(),
	loadProfilesFn = loadDisposableProfilesFromDb,
	upsertProfilesFn = upsertDisposableProfilesToDb
} = {}) {
	const normalizedDomain = normalizeDisposableDomain(domain)
	if(!normalizedDomain) return null

	const profilesByDomain = await loadProfilesFn([normalizedDomain], { db })
	const existingProfile = profilesByDomain.get(normalizedDomain) || null
	const profile = createDisposableMxInfrastructureProfile(normalizedDomain, mxSnapshot, {
		now,
		existingProfile
	})
	if(!profile) return null

	await upsertProfilesFn([profile], { db })
	await cacheDiscoveredDisposableProfile(redisClient, profile)

	return profile
}
