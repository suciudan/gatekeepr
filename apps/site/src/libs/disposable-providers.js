import redis from "@repo/core/redis"
import { unstable_cache } from "next/cache"
import {
	DISPOSABLE_EMAILS_KEY,
	DISPOSABLE_PROVIDER_INDEX_KEY,
	createDisposableProviderDirectory,
	getDisposableProviderDetailKey,
	getDisposableProfileKey,
	sortDisposableDomains
} from "@repo/core/disposable-domains"

export const DISPOSABLE_PROVIDER_PAGE_SIZE = 25
const PROVIDER_CACHE_SECONDS = 60 * 60
const PROVIDER_FALLBACK_CACHE_SECONDS = 60
const PROFILE_CHUNK_SIZE = 250
let providerDirectoryCache = {
	expiresAt: 0,
	promise: null,
	value: null
}

function chunkValues(values, size = PROFILE_CHUNK_SIZE) {
	const chunks = []
	for(let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size))
	}
	return chunks
}

function parseProfileJson(value) {
	if(!value) return null
	try {
		return typeof value === "string" ? JSON.parse(value) : value
	} catch {
		return null
	}
}

function parseJson(value) {
	if(!value) return null
	try {
		return typeof value === "string" ? JSON.parse(value) : value
	} catch {
		return null
	}
}

async function loadDisposableProfilesFromRedis() {
	try {
		const domains = sortDisposableDomains(await redis.smembers(DISPOSABLE_EMAILS_KEY))
		const profiles = []

		for(const chunk of chunkValues(domains)) {
			const pipeline = redis.pipeline()
			for(const domain of chunk) {
				pipeline.call("JSON.GET", getDisposableProfileKey(domain))
			}

			const results = await pipeline.exec()
			for(const [error, value] of results || []) {
				if(error) continue
				const profile = parseProfileJson(value)
				if(profile?.domain) profiles.push(profile)
			}
		}

		return profiles
	} catch {
		return []
	}
}

async function loadDisposableProviderIndexFromRedis() {
	try {
		const cached = parseJson(await redis.get(DISPOSABLE_PROVIDER_INDEX_KEY))
		if(!cached || !Array.isArray(cached.providers)) return null
		return cached.providers
	} catch {
		return null
	}
}

async function loadDisposableProviderDetailFromRedis(slug) {
	try {
		const cached = parseJson(await redis.get(getDisposableProviderDetailKey(slug)))
		return cached?.provider || null
	} catch {
		return null
	}
}

const loadCachedDisposableProviderDirectoryFromProfiles = unstable_cache(
	async () => {
		const profiles = await loadDisposableProfilesFromRedis()
		return createDisposableProviderDirectory(profiles)
	},
	["disposable-provider-directory-fallback"],
	{
		revalidate: PROVIDER_CACHE_SECONDS,
		tags: ["disposable-provider-directory"]
	}
)

export async function getDisposableProviderDirectory() {
	const now = Date.now()
	if(providerDirectoryCache.value && providerDirectoryCache.expiresAt > now) {
		return providerDirectoryCache.value
	}
	if(providerDirectoryCache.promise) return providerDirectoryCache.promise

	providerDirectoryCache.promise = (async () => {
		const cachedIndex = await loadDisposableProviderIndexFromRedis()
		const value = cachedIndex || await loadCachedDisposableProviderDirectoryFromProfiles()
		providerDirectoryCache = {
			expiresAt: Date.now() + ((cachedIndex ? PROVIDER_CACHE_SECONDS : PROVIDER_FALLBACK_CACHE_SECONDS) * 1000),
			promise: null,
			value
		}
		return value
	})()

	try {
		return await providerDirectoryCache.promise
	} catch(error) {
		providerDirectoryCache.promise = null
		throw error
	}
}

function normalizeProviderFilters(filters = {}) {
	const query = typeof filters.query === "string" ? filters.query.trim().toLowerCase() : ""
	const minDomainCount = Math.max(0, Math.floor(Number(filters.minDomainCount) || 0))

	return {
		query,
		minDomainCount
	}
}

function providerMatchesQuery(provider, query) {
	if(!query) return true
	if(provider.searchText) return provider.searchText.includes(query)

	return [
		provider.label,
		provider.type,
		...(provider.mxHosts || []),
		...(provider.mxIpv4 || []),
		...(provider.mxIpv6 || []),
		...(provider.domains || []).map(domain => domain.domain)
	]
		.filter(Boolean)
		.some(value => value.toLowerCase().includes(query))
}

function filterDisposableProviders(providers, filters = {}) {
	const { query, minDomainCount } = normalizeProviderFilters(filters)

	return providers.filter((provider) => {
		if(provider.domainCount < minDomainCount) return false
		return providerMatchesQuery(provider, query)
	})
}

export async function getDisposableProviderPage(page = 1, filters = {}) {
	const providers = await getDisposableProviderDirectory()
	const filteredProviders = filterDisposableProviders(providers, filters)
	const currentPage = Math.max(1, Math.floor(Number(page) || 1))
	const totalPages = Math.max(1, Math.ceil(filteredProviders.length / DISPOSABLE_PROVIDER_PAGE_SIZE))
	const safePage = Math.min(currentPage, totalPages)
	const start = (safePage - 1) * DISPOSABLE_PROVIDER_PAGE_SIZE

	return {
		providers: filteredProviders.slice(start, start + DISPOSABLE_PROVIDER_PAGE_SIZE),
		totalProviders: providers.length,
		totalMatchingProviders: filteredProviders.length,
		totalPages,
		page: safePage
	}
}

export async function getDisposableProviderBySlug(slug) {
	const normalizedSlug = typeof slug === "string" ? slug.trim().toLowerCase() : ""
	if(!normalizedSlug) return null
	const providers = await getDisposableProviderDirectory()
	const provider = providers.find(provider => provider.slug === normalizedSlug || provider.pathSlug === normalizedSlug)
	if(provider) {
		const cachedProvider = await loadDisposableProviderDetailFromRedis(provider.slug)
		if(cachedProvider) return cachedProvider
	}

	const fallbackProviders = await loadCachedDisposableProviderDirectoryFromProfiles()
	return fallbackProviders.find(provider => provider.slug === normalizedSlug || provider.pathSlug === normalizedSlug) || null
}
