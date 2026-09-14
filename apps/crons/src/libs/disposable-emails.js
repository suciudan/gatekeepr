import pLimit from "p-limit"

import {
	DISPOSABLE_EMAILS_KEY,
	DISPOSABLE_ENRICHMENT_DUE_KEY,
	DISPOSABLE_MX_REFRESH_DUE_KEY,
	DISPOSABLE_MX_HOSTS_KEY,
	DISPOSABLE_MX_IPV4_KEY,
	DISPOSABLE_MX_IPV6_KEY,
	createDisposableMxIndexData,
	getDisposableProfileKey,
	normalizeDisposableDomain,
	sortDisposableDomains
} from "@repo/core/disposable-domains"
import {
	assertDisposableDomainProfileSchema,
	getDueDisposableDomainsFromDb,
	getDueDisposableMxRefreshDomainsFromDb,
	listActiveDisposableDomains,
	loadDisposableProfilesFromDb,
	upsertDisposableProfilesToDb
} from "./disposable-profiles-db.js"

export { assertDisposableDomainProfileSchema }

export const disposableDomainSources = [
	"https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/refs/heads/main/disposable_email_blocklist.conf",
	"https://raw.githubusercontent.com/TempMailDetector/Temporary-Email-Domain-Blocklist/refs/heads/main/domains.txt",
	"https://raw.githubusercontent.com/Propaganistas/Laravel-Disposable-Email/refs/heads/master/domains.json",
	"https://raw.githubusercontent.com/wesbos/burner-email-providers/refs/heads/master/emails.txt",
	"https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt",
	"https://raw.githubusercontent.com/unkn0w/disposable-email-domain-list/refs/heads/main/domains.txt",
	"https://raw.githubusercontent.com/7c/fakefilter/refs/heads/main/txt/data.txt",
	"https://disify.com/blacklist/domains"
]

export const seededDisposableDomains = [
	"mailper.com",
	"mostakbile.com"
]

function chunkValues(values, size = 1000) {
	const chunks = []
	for(let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size))
	}
	return chunks
}

export function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function parseDisposableText(text) {
	const domains = []
	for(const row of String(text).split(/\r?\n/)) {
		const trimmed = row.trim()
		if(!trimmed) continue
		if(trimmed.startsWith("#")) continue
		const domain = normalizeDisposableDomain(trimmed.replace(/^##\s+/, ""))
		if(domain) domains.push(domain)
	}
	return domains
}

function parseDisposableJson(json) {
	if(!Array.isArray(json)) return []
	return json
		.map(normalizeDisposableDomain)
		.filter(Boolean)
}

export async function fetchDisposableDomains({
	loggerFn,
	fetchImpl = fetch,
	concurrency = 10
} = {}) {
	const limit = pLimit(Math.max(1, concurrency))
	const domains = new Set(seededDisposableDomains)

	await Promise.all(disposableDomainSources.map(link => limit(async () => {
		try {
			const response = await fetchImpl(link)
			if(!response.ok) throw new Error(`HTTP ${response.status}`)

			const parsedDomains = link.includes(".json")
				? parseDisposableJson(await response.json())
				: parseDisposableText(await response.text())
			for(const domain of parsedDomains) {
				domains.add(domain)
			}
		} catch(error) {
			if(loggerFn) {
				await loggerFn(`disposable: ${error.message} (${link})`, process.env.SLACK_ERRORS_CRON)
			}
		}
	})))

	return sortDisposableDomains([...domains])
}

export function selectRemovedDisposableSourceDomains(previousDomains, currentDomains, profilesByDomain) {
	const currentDomainSet = new Set(sortDisposableDomains(currentDomains))
	return sortDisposableDomains(previousDomains).filter(domain => {
		if(currentDomainSet.has(domain)) return false
		const profile = profilesByDomain instanceof Map
			? profilesByDomain.get(domain)
			: profilesByDomain?.[domain]
		return (profile?.source || "source") === "source"
	})
}

export async function writeDisposableSet(redisClient, domains) {
	const uniqueDomains = sortDisposableDomains(domains)
	const tx = redisClient.multi()
	tx.del(DISPOSABLE_EMAILS_KEY)
	for(const chunk of chunkValues(uniqueDomains)) {
		tx.sadd(DISPOSABLE_EMAILS_KEY, ...chunk)
	}
	await tx.exec()
	return uniqueDomains
}

export async function loadDisposableProfiles(redisClient, domains) {
	return loadDisposableProfilesFromDb(domains)
}

async function cacheDisposableProfiles(redisClient, profiles) {
	if(!profiles.length) return
	for(const chunk of chunkValues(profiles, 250)) {
		const pipeline = redisClient.pipeline()
		for(const profile of chunk) {
			pipeline.call("JSON.SET", getDisposableProfileKey(profile.domain), "$", JSON.stringify(profile))
			if(profile.isDisposable && profile.nextEnrichmentAt) {
				const score = Date.parse(profile.nextEnrichmentAt)
				if(Number.isFinite(score)) pipeline.zadd(DISPOSABLE_ENRICHMENT_DUE_KEY, score, profile.domain)
				else pipeline.zrem(DISPOSABLE_ENRICHMENT_DUE_KEY, profile.domain)
			} else {
				pipeline.zrem(DISPOSABLE_ENRICHMENT_DUE_KEY, profile.domain)
			}

			if(profile.isDisposable && profile.nextMxRefreshAt) {
				const mxScore = Date.parse(profile.nextMxRefreshAt)
				if(Number.isFinite(mxScore)) pipeline.zadd(DISPOSABLE_MX_REFRESH_DUE_KEY, mxScore, profile.domain)
				else pipeline.zrem(DISPOSABLE_MX_REFRESH_DUE_KEY, profile.domain)
			} else {
				pipeline.zrem(DISPOSABLE_MX_REFRESH_DUE_KEY, profile.domain)
			}
		}
		await pipeline.exec()
	}
}

export async function saveDisposableProfiles(redisClient, profiles) {
	if(!profiles.length) return
	await upsertDisposableProfilesToDb(profiles)
	await cacheDisposableProfiles(redisClient, profiles)
}

export async function getDueDisposableDomains(redisClient, {
	now = new Date(),
	limit = 0
} = {}) {
	return getDueDisposableDomainsFromDb({
		now,
		limit
	})
}

export async function getDueDisposableMxRefreshDomains(redisClient, {
	now = new Date(),
	limit = 0
} = {}) {
	return getDueDisposableMxRefreshDomainsFromDb({
		now,
		limit
	})
}

export function listDisposableDomains(options = {}) {
	return listActiveDisposableDomains(options)
}

export async function rebuildDisposableRedisCache(redisClient, {
	domains = null,
	profiles = null
} = {}) {
	const activeDomains = Array.isArray(domains)
		? sortDisposableDomains(domains)
		: await listDisposableDomains()
	const profilesByDomain = profiles instanceof Map
		? profiles
		: await loadDisposableProfiles(redisClient, activeDomains)
	const profileList = profilesByDomain instanceof Map
		? [...profilesByDomain.values()]
		: (Array.isArray(profiles) ? profiles : [])

	await writeDisposableSet(redisClient, activeDomains)
	await cacheDisposableProfiles(redisClient, profileList)
	const mxIndexResult = await rebuildDisposableMxIndexes(redisClient, profilesByDomain)

	return {
		domains: activeDomains.length,
		profiles: profileList.length,
		...mxIndexResult
	}
}

export async function rebuildDisposableMxIndexes(redisClient, profiles) {
	const indexData = createDisposableMxIndexData(profiles)
	const tx = redisClient.multi()
	tx.del(DISPOSABLE_MX_HOSTS_KEY, DISPOSABLE_MX_IPV4_KEY, DISPOSABLE_MX_IPV6_KEY)

	for(const chunk of chunkValues(indexData.mxHosts)) {
		tx.sadd(DISPOSABLE_MX_HOSTS_KEY, ...chunk)
	}
	for(const chunk of chunkValues(indexData.mxIpv4)) {
		tx.sadd(DISPOSABLE_MX_IPV4_KEY, ...chunk)
	}
	for(const chunk of chunkValues(indexData.mxIpv6)) {
		tx.sadd(DISPOSABLE_MX_IPV6_KEY, ...chunk)
	}

	await tx.exec()

	return {
		mxHosts: indexData.mxHosts.length,
		mxIpv4: indexData.mxIpv4.length,
		mxIpv6: indexData.mxIpv6.length
	}
}
