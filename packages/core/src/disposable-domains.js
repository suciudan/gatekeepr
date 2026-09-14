import crypto from "node:crypto"
import { isIP } from "node:net"
import { domainToASCII } from "node:url"

import { isPrivateIP } from "./ip.js"

export const DISPOSABLE_EMAILS_KEY = "disposable_emails"
export const DISPOSABLE_ENRICHMENT_DUE_KEY = "disposable_domain_enrichment_due"
export const DISPOSABLE_MX_REFRESH_DUE_KEY = "disposable_domain_mx_refresh_due"
export const DISPOSABLE_PROFILE_PREFIX = "disposable_domain_profile:"
export const DISPOSABLE_MX_HOSTS_KEY = "disposable_mx_hosts"
export const DISPOSABLE_MX_IPV4_KEY = "disposable_mx_ipv4"
export const DISPOSABLE_MX_IPV6_KEY = "disposable_mx_ipv6"
export const DISPOSABLE_PROVIDER_INDEX_KEY = "disposable_provider_index"
export const DISPOSABLE_PROVIDER_DETAIL_PREFIX = "disposable_provider_detail:"
export const DISPOSABLE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
export const DISPOSABLE_RETRY_MS = 24 * 60 * 60 * 1000
export const DISPOSABLE_BOOTSTRAP_WINDOW_MS = DISPOSABLE_WEEK_MS
export const DISPOSABLE_PROVIDER_SLUG_HASH_LENGTH = 8
export const DISPOSABLE_PROVIDER_EXCLUDED_MX_SUFFIXES = [
	".mx.cloudflare.net"
]
export const DISPOSABLE_PROVIDER_EXCLUDED_MX_DOMAINS = [
	"amazonaws.com",
	"google.com",
	"googlemail.com",
	"outlook.com"
]
const COMMON_SECOND_LEVEL_PUBLIC_SUFFIXES = new Set([
	"ac",
	"co",
	"com",
	"edu",
	"gov",
	"net",
	"org"
])
const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
	"co.uk",
	"org.uk",
	"gov.uk",
	"ac.uk",
	"com.au",
	"net.au",
	"org.au",
	"co.nz",
	"org.nz",
	"com.br",
	"com.cn",
	"com.mx",
	"com.tr",
	"co.za",
	"com.pl"
])
const DNS_HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function toIsoTimestamp(value = new Date()) {
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toTimestampMs(value) {
	const ms = Date.parse(value)
	return Number.isFinite(ms) ? ms : null
}

function normalizeString(value) {
	return typeof value === "string" ? value.trim() : ""
}

function normalizeStatusList(status) {
	if(!Array.isArray(status)) return []
	return [...new Set(status
		.map(value => normalizeString(value).toLowerCase())
		.filter(Boolean))]
}

function normalizeMxRecords(mxRecords) {
	if(!Array.isArray(mxRecords)) return []
	return mxRecords
		.map(record => ({
			exchange: normalizeString(record?.exchange).toLowerCase(),
			priority: Number(record?.priority)
		}))
		.filter(record => record.exchange)
		.sort((left, right) => {
			if(left.priority !== right.priority) return left.priority - right.priority
			return left.exchange.localeCompare(right.exchange)
		})
}

function normalizeTimestamp(value) {
	const timestampMs = toTimestampMs(value)
	return Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : null
}

function normalizeIpList(values, version) {
	if(!Array.isArray(values)) return []
	return [...new Set(values
		.map(value => normalizeString(value).toLowerCase())
		.filter(value => isIP(value) === version))]
		.sort((left, right) => left.localeCompare(right))
}

function normalizeMxResolvedRecords(mxResolvedRecords) {
	if(!Array.isArray(mxResolvedRecords)) return []
	return mxResolvedRecords
		.map(record => ({
			exchange: normalizeString(record?.exchange).toLowerCase(),
			priority: Number(record?.priority),
			ipv4: normalizeIpList(record?.ipv4, 4),
			ipv6: normalizeIpList(record?.ipv6, 6)
		}))
		.filter(record => record.exchange)
		.map(record => ({
			exchange: record.exchange,
			priority: Number.isFinite(record.priority) ? record.priority : 0,
			ipv4: record.ipv4,
			ipv6: record.ipv6
		}))
		.sort((left, right) => {
			if(left.priority !== right.priority) return left.priority - right.priority
			return left.exchange.localeCompare(right.exchange)
		})
}

function normalizeProviderSlugLabel(value) {
	const label = normalizeString(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
	return label || "provider"
}

function hashToUInt32(value) {
	return crypto.createHash("sha1").update(value).digest().readUInt32BE(0)
}

function hashToHex(value, length = DISPOSABLE_PROVIDER_SLUG_HASH_LENGTH) {
	return crypto.createHash("sha1")
		.update(value)
		.digest("hex")
		.slice(0, Math.max(1, Number(length) || DISPOSABLE_PROVIDER_SLUG_HASH_LENGTH))
}

function latestTimestamp(left, right) {
	const leftMs = toTimestampMs(left)
	const rightMs = toTimestampMs(right)
	if(!Number.isFinite(leftMs)) return Number.isFinite(rightMs) ? right : left || right || null
	if(!Number.isFinite(rightMs)) return left
	return rightMs > leftMs ? right : left
}

function earliestTimestamp(left, right) {
	const leftMs = toTimestampMs(left)
	const rightMs = toTimestampMs(right)
	if(!Number.isFinite(leftMs)) return Number.isFinite(rightMs) ? right : left || right || null
	if(!Number.isFinite(rightMs)) return left
	return rightMs < leftMs ? right : left
}

function compareTimestampDesc(left, right) {
	const leftMs = toTimestampMs(left)
	const rightMs = toTimestampMs(right)
	if(Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs !== rightMs) return rightMs - leftMs
	if(Number.isFinite(leftMs) && !Number.isFinite(rightMs)) return -1
	if(!Number.isFinite(leftMs) && Number.isFinite(rightMs)) return 1
	return 0
}

function collectProviderInfrastructure(domains, key) {
	return [...new Set(domains.flatMap(domain => domain[key] || []))]
		.sort((left, right) => left.localeCompare(right))
}

function mergeSortedUnique(...lists) {
	return [...new Set(lists.flat().filter(Boolean))]
		.sort((left, right) => left.localeCompare(right))
}

function mergeRecordList(...lists) {
	const recordsByKey = new Map()
	for(const record of lists.flat()) {
		if(!record) continue
		const key = JSON.stringify(record)
		if(!recordsByKey.has(key)) recordsByKey.set(key, record)
	}
	return [...recordsByKey.values()]
}

function getDisposableProviderKeys(profile) {
	const mxRecords = normalizeMxRecords(profile?.mxRecords)
	const mxResolvedRecords = normalizeMxResolvedRecords(profile?.mxResolvedRecords)
	const mxHosts = [...new Set([
		...mxRecords.map(record => record.exchange),
		...mxResolvedRecords.map(record => record.exchange)
	]
		.map(getDisposableProviderMxDisplayDomain)
		.filter(Boolean))]
		.sort((left, right) => left.localeCompare(right))

	if(mxHosts.length > 0) {
		return mxHosts.map(host => ({
			type: "mx_host",
			key: host,
			label: host
		}))
	}

	return []
}

function hasMxExchangeSuffix(profile, suffixes) {
	const normalizedSuffixes = (Array.isArray(suffixes) ? suffixes : [])
		.map(value => normalizeString(value).toLowerCase())
		.filter(Boolean)
	if(normalizedSuffixes.length === 0) return false

	const mxRecords = normalizeMxRecords(profile?.mxRecords)
	const mxResolvedRecords = normalizeMxResolvedRecords(profile?.mxResolvedRecords)
	const exchanges = [
		...mxRecords.map(record => record.exchange),
		...mxResolvedRecords.map(record => record.exchange)
	]

	return exchanges.some(exchange => normalizedSuffixes.some(suffix => exchange.endsWith(suffix)))
}

export function normalizeDisposableMxInfrastructureHost(value) {
	const domain = normalizeDisposableDomain(value)
	if(!domain || isIP(domain)) return null
	const labels = domain.split(".").filter(Boolean)
	if(labels.length < 2) return null
	if(labels.some(label => !DNS_HOST_LABEL_PATTERN.test(label))) return null
	return domain
}

function getDisposableProviderMxDisplayDomain(value) {
	const domain = normalizeDisposableMxInfrastructureHost(value)
	return domain ? getDisposableProviderDisplayDomain(domain) : null
}

export function isDisposableMxInfrastructureIp(value) {
	return isIP(value) && !isPrivateIP(value)
}

function hasMxExchangeDisplayDomain(profile, domains) {
	const normalizedDomains = new Set((Array.isArray(domains) ? domains : [])
		.map(getDisposableProviderDisplayDomain)
		.filter(Boolean))
	if(normalizedDomains.size === 0) return false

	const mxRecords = normalizeMxRecords(profile?.mxRecords)
	const mxResolvedRecords = normalizeMxResolvedRecords(profile?.mxResolvedRecords)
	const exchanges = [
		...mxRecords.map(record => record.exchange),
		...mxResolvedRecords.map(record => record.exchange)
	]

	return exchanges.some(exchange => normalizedDomains.has(getDisposableProviderMxDisplayDomain(exchange)))
}

export function hasDisposableProviderExcludedMxRoute(profile) {
	return hasMxExchangeSuffix(profile, DISPOSABLE_PROVIDER_EXCLUDED_MX_SUFFIXES) ||
		hasMxExchangeDisplayDomain(profile, DISPOSABLE_PROVIDER_EXCLUDED_MX_DOMAINS)
}

export function getDisposableProviderDisplayDomain(value) {
	const domain = normalizeDisposableDomain(value)
	if(!domain) return null
	const labels = domain.split(".").filter(Boolean)
	if(labels.length <= 2) return domain

	const lastLabel = labels.at(-1)
	const secondLastLabel = labels.at(-2)
	const twoLabelSuffix = labels.slice(-2).join(".")
	const suffixLength = MULTI_LABEL_PUBLIC_SUFFIXES.has(twoLabelSuffix) ||
		(lastLabel.length === 2 && COMMON_SECOND_LEVEL_PUBLIC_SUFFIXES.has(secondLastLabel))
		? 2
		: 1
	const displayLabels = labels.slice(-(suffixLength + 1))

	return displayLabels.join(".")
}

function createDisposableProviderDomainEntry(profile) {
	const mxRecords = normalizeMxRecords(profile?.mxRecords)
	const mxResolvedRecords = normalizeMxResolvedRecords(profile?.mxResolvedRecords)
	const routableMxResolvedRecords = mxResolvedRecords
		.filter(record => normalizeDisposableMxInfrastructureHost(record.exchange))
	const mxHosts = [...new Set([
		...mxRecords.map(record => record.exchange),
		...mxResolvedRecords.map(record => record.exchange)
	]
		.map(normalizeDisposableMxInfrastructureHost)
		.filter(Boolean))]
		.sort((left, right) => left.localeCompare(right))
	const mxIpv4 = [...new Set(routableMxResolvedRecords.flatMap(record => record.ipv4)
		.filter(isDisposableMxInfrastructureIp))]
		.sort((left, right) => left.localeCompare(right))
	const mxIpv6 = [...new Set(routableMxResolvedRecords.flatMap(record => record.ipv6)
		.filter(isDisposableMxInfrastructureIp))]
		.sort((left, right) => left.localeCompare(right))

	return {
		domain: getDisposableProviderDisplayDomain(profile.domain) || profile.domain,
		sourceDomains: [profile.domain],
		firstSeenAt: profile.firstSeenAt || null,
		lastSeenAt: profile.lastSeenAt || null,
		lastEnrichedAt: profile.lastEnrichedAt || null,
		creation: profile.creation || null,
		expiration: profile.expiration || null,
		mxRecords,
		mxResolvedAt: normalizeTimestamp(profile.mxResolvedAt),
		mxResolvedRecords,
		mxHosts,
		mxIpv4,
		mxIpv6
	}
}

function mergeDisposableProviderDomainEntry(existing, incoming) {
	return {
		...existing,
		sourceDomains: mergeSortedUnique(existing.sourceDomains, incoming.sourceDomains),
		firstSeenAt: earliestTimestamp(existing.firstSeenAt, incoming.firstSeenAt),
		lastSeenAt: latestTimestamp(existing.lastSeenAt, incoming.lastSeenAt),
		lastEnrichedAt: latestTimestamp(existing.lastEnrichedAt, incoming.lastEnrichedAt),
		creation: earliestTimestamp(existing.creation, incoming.creation),
		expiration: latestTimestamp(existing.expiration, incoming.expiration),
		mxRecords: mergeRecordList(existing.mxRecords, incoming.mxRecords),
		mxResolvedAt: latestTimestamp(existing.mxResolvedAt, incoming.mxResolvedAt),
		mxResolvedRecords: mergeRecordList(existing.mxResolvedRecords, incoming.mxResolvedRecords),
		mxHosts: mergeSortedUnique(existing.mxHosts, incoming.mxHosts),
		mxIpv4: mergeSortedUnique(existing.mxIpv4, incoming.mxIpv4),
		mxIpv6: mergeSortedUnique(existing.mxIpv6, incoming.mxIpv6)
	}
}

export function getDisposableProfileKey(domain) {
	return `${DISPOSABLE_PROFILE_PREFIX}${domain}`
}

export function getDisposableProviderDetailKey(slug) {
	return `${DISPOSABLE_PROVIDER_DETAIL_PREFIX}${normalizeString(slug).toLowerCase()}`
}

export function createDisposableProviderSlug(value, type = "mx_ip") {
	const normalizedType = normalizeString(type).toLowerCase() || "mx_ip"
	const normalizedValue = normalizedType === "mx_host"
		? normalizeDisposableDomain(value)
		: normalizeString(value).toLowerCase()
	const slugValue = normalizedValue || normalizeString(value).toLowerCase()
	const label = normalizeProviderSlugLabel(slugValue)
	const hash = hashToHex(`${normalizedType}:${slugValue}`)
	return `${label}-${hash}`
}

export function createDisposableProviderPathSlug(value, type = "mx_ip") {
	const normalizedType = normalizeString(type).toLowerCase() || "mx_ip"
	if(normalizedType === "mx_host") return normalizeDisposableDomain(value)
	return createDisposableProviderSlug(value, normalizedType)
}

export function normalizeDisposableDomain(value) {
	let normalized = normalizeString(value).toLowerCase()
	if(!normalized) return null
	normalized = normalized
		.replace(/^@+/, "")
		.replace(/^\*\.?/, "")
		.replace(/\.+$/g, "")
	const ascii = domainToASCII(normalized)
	return normalizeString(ascii || normalized).toLowerCase() || null
}

export function extractDisposableLookupDomain(value) {
	const input = normalizeString(value)
	if(!input) return null
	const atIndex = input.lastIndexOf("@")
	if(atIndex !== -1) return normalizeDisposableDomain(input.slice(atIndex + 1))
	return normalizeDisposableDomain(input)
}

export function sortDisposableDomains(domains) {
	return [...new Set((Array.isArray(domains) ? domains : [])
		.map(normalizeDisposableDomain)
		.filter(Boolean))]
		.sort((left, right) => left.localeCompare(right))
}

function normalizeTimestampMs(value, fallback = Date.now()) {
	const timestampMs = toTimestampMs(value)
	return Number.isFinite(timestampMs) ? timestampMs : fallback
}

function normalizePositiveInteger(value, fallback) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function scheduleWeeklyDisposableRefresh(value = new Date()) {
	const baseMs = toTimestampMs(value) ?? Date.now()
	return new Date(baseMs + DISPOSABLE_WEEK_MS).toISOString()
}

export function scheduleDisposableRetry(value = new Date(), delayMs = DISPOSABLE_RETRY_MS) {
	const baseMs = toTimestampMs(value) ?? Date.now()
	return new Date(baseMs + delayMs).toISOString()
}

export function scheduleDisposableMxRefresh(value = new Date(), delayMs = 0) {
	const baseMs = toTimestampMs(value) ?? Date.now()
	return new Date(baseMs + Math.max(0, Number(delayMs) || 0)).toISOString()
}

export function scheduleBootstrapDisposableRefresh(domain, value = new Date(), windowMs = DISPOSABLE_BOOTSTRAP_WINDOW_MS) {
	const baseMs = toTimestampMs(value) ?? Date.now()
	if(windowMs <= 0) return new Date(baseMs).toISOString()
	const offsetMs = hashToUInt32(domain) % windowMs
	return new Date(baseMs + offsetMs).toISOString()
}

export function createDisposableProfile(domain, {
	now = new Date(),
	existingProfile = null,
	isNewDomain = false,
	source = existingProfile?.source || "source"
} = {}) {
	const timestamp = toIsoTimestamp(now)
	const nextEnrichmentAt = (() => {
		if(isNewDomain) return timestamp
		if(existingProfile?.nextEnrichmentAt) return existingProfile.nextEnrichmentAt
		if(existingProfile?.lastEnrichedAt) return scheduleWeeklyDisposableRefresh(existingProfile.lastEnrichedAt)
		if(existingProfile?.isDisposable === false) return timestamp
		return scheduleBootstrapDisposableRefresh(domain, timestamp)
	})()

	return {
		domain,
		source,
		isDisposable: true,
		firstSeenAt: existingProfile?.firstSeenAt || timestamp,
		lastSeenAt: timestamp,
		removedAt: null,
		lastEnrichedAt: existingProfile?.lastEnrichedAt || null,
		lastEnrichmentError: existingProfile?.lastEnrichmentError || null,
		nextEnrichmentAt,
		creation: existingProfile?.creation || null,
		expiration: existingProfile?.expiration || null,
		owner: existingProfile?.owner || null,
		status: normalizeStatusList(existingProfile?.status),
		mxRecords: normalizeMxRecords(existingProfile?.mxRecords),
		nextMxRefreshAt: normalizeTimestamp(existingProfile?.nextMxRefreshAt),
		mxResolvedAt: normalizeTimestamp(existingProfile?.mxResolvedAt),
		mxResolvedRecords: normalizeMxResolvedRecords(existingProfile?.mxResolvedRecords)
	}
}

export function createDisposableMxInfrastructureProfile(domain, mxSnapshot, {
	now = new Date(),
	existingProfile = null
} = {}) {
	const normalizedDomain = normalizeDisposableDomain(domain)
	if(!normalizedDomain) return null

	const timestamp = toIsoTimestamp(now)
	return {
		...createDisposableProfile(normalizedDomain, {
			now,
			existingProfile,
			isNewDomain: existingProfile?.isDisposable !== true,
			source: "mx_disposable_infrastructure"
		}),
		mxRecords: normalizeMxRecords(mxSnapshot?.mxRecords),
		nextMxRefreshAt: scheduleWeeklyDisposableRefresh(timestamp),
		mxResolvedAt: normalizeTimestamp(mxSnapshot?.mxResolvedAt),
		mxResolvedRecords: normalizeMxResolvedRecords(mxSnapshot?.mxResolvedRecords)
	}
}

export function createRemovedDisposableProfile(existingProfile, {
	now = new Date()
} = {}) {
	if(!existingProfile) return null
	return {
		...createDisposableProfile(existingProfile.domain, {
			now,
			existingProfile
		}),
		isDisposable: false,
		removedAt: existingProfile.removedAt || toIsoTimestamp(now),
		nextEnrichmentAt: null,
		nextMxRefreshAt: null
	}
}

export function applyDisposableEnrichment(profile, domainInfo, {
	now = new Date(),
	preserveMxSnapshot = false,
	nextMxRefreshAt
} = {}) {
	const timestamp = toIsoTimestamp(now)
	const hasMxResolvedAt = Object.prototype.hasOwnProperty.call(domainInfo || {}, "mxResolvedAt")
	const hasMxResolvedRecords = Object.prototype.hasOwnProperty.call(domainInfo || {}, "mxResolvedRecords")
	return {
		...profile,
		lastEnrichedAt: timestamp,
		lastEnrichmentError: null,
		nextEnrichmentAt: scheduleWeeklyDisposableRefresh(timestamp),
		creation: domainInfo?.creation || null,
		expiration: domainInfo?.expiration || null,
		owner: domainInfo?.owner || null,
		status: normalizeStatusList(domainInfo?.status),
		mxRecords: normalizeMxRecords(domainInfo?.mxRecords),
		nextMxRefreshAt: nextMxRefreshAt === undefined
			? normalizeTimestamp(profile?.nextMxRefreshAt)
			: normalizeTimestamp(nextMxRefreshAt),
		mxResolvedAt: preserveMxSnapshot && !hasMxResolvedAt
			? normalizeTimestamp(profile?.mxResolvedAt)
			: normalizeTimestamp(domainInfo?.mxResolvedAt),
		mxResolvedRecords: preserveMxSnapshot && !hasMxResolvedRecords
			? normalizeMxResolvedRecords(profile?.mxResolvedRecords)
			: normalizeMxResolvedRecords(domainInfo?.mxResolvedRecords)
	}
}

export function applyDisposableEnrichmentFailure(profile, error, {
	now = new Date()
} = {}) {
	const message = normalizeString(error?.message || error || "Unknown enrichment error")
	return {
		...profile,
		lastEnrichmentError: message,
		nextEnrichmentAt: scheduleDisposableRetry(now)
	}
}

export function toPublicDisposableProfile(profile) {
	if(!profile || profile.isDisposable === false) return null
	return {
		domain: profile.domain,
		isDisposable: true,
		firstSeenAt: profile.firstSeenAt || null,
		lastSeenAt: profile.lastSeenAt || null,
		lastEnrichedAt: profile.lastEnrichedAt || null,
		creation: profile.creation || null,
		expiration: profile.expiration || null,
		owner: profile.owner || null,
		status: normalizeStatusList(profile.status),
		mxRecords: normalizeMxRecords(profile.mxRecords),
		mxResolvedAt: normalizeTimestamp(profile.mxResolvedAt),
		mxResolvedRecords: normalizeMxResolvedRecords(profile.mxResolvedRecords)
	}
}

export function createDisposablePackageArtifacts(profiles) {
	const publicProfiles = (Array.isArray(profiles) ? profiles : [])
		.map(toPublicDisposableProfile)
		.filter(Boolean)
		.sort((left, right) => left.domain.localeCompare(right.domain))
	const domains = publicProfiles.map(profile => profile.domain)
	const extendedProfiles = Object.fromEntries(publicProfiles.map(profile => [profile.domain, profile]))

	return {
		domains,
		disposableJson: `${JSON.stringify(domains, null, 2)}\n`,
		disposableTxt: `${domains.join("\n")}${domains.length ? "\n" : ""}`,
		disposableExtendedJson: `${JSON.stringify(extendedProfiles, null, 2)}\n`
	}
}

export function createDisposableMxIndexData(profiles) {
	const profileList = profiles instanceof Map
		? [...profiles.values()]
		: (Array.isArray(profiles) ? profiles : [])
	const activeProfiles = profileList
		.filter(profile => profile && profile.isDisposable !== false)
		.filter(profile => !hasDisposableProviderExcludedMxRoute(profile))
	const mxHosts = [...new Set(activeProfiles.flatMap(profile => [
		...normalizeMxRecords(profile.mxRecords).map(record => record.exchange),
		...normalizeMxResolvedRecords(profile.mxResolvedRecords).map(record => record.exchange)
	]
		.map(normalizeDisposableMxInfrastructureHost)
		.filter(Boolean)))].sort((left, right) => left.localeCompare(right))
	const mxIpv4 = [...new Set(activeProfiles.flatMap(profile =>
		normalizeMxResolvedRecords(profile.mxResolvedRecords)
			.filter(record => normalizeDisposableMxInfrastructureHost(record.exchange))
			.flatMap(record => record.ipv4.filter(isDisposableMxInfrastructureIp))
	))].sort((left, right) => left.localeCompare(right))
	const mxIpv6 = [...new Set(activeProfiles.flatMap(profile =>
		normalizeMxResolvedRecords(profile.mxResolvedRecords)
			.filter(record => normalizeDisposableMxInfrastructureHost(record.exchange))
			.flatMap(record => record.ipv6.filter(isDisposableMxInfrastructureIp))
	))].sort((left, right) => left.localeCompare(right))

	return {
		mxHosts,
		mxIpv4,
		mxIpv6
	}
}

export function createDisposableProviderDirectory(profiles) {
	const profileList = profiles instanceof Map
		? [...profiles.values()]
		: (Array.isArray(profiles) ? profiles : [])
	const providersByKey = new Map()

	for(const profile of profileList) {
		const publicProfile = toPublicDisposableProfile(profile)
		if(!publicProfile) continue
		if(hasDisposableProviderExcludedMxRoute(publicProfile)) continue

		const providerKeys = getDisposableProviderKeys(publicProfile)
		if(providerKeys.length === 0) continue

		const domainEntry = createDisposableProviderDomainEntry(publicProfile)
		for(const providerKey of providerKeys) {
			const mapKey = `${providerKey.type}:${providerKey.key}`
			if(!providersByKey.has(mapKey)) {
				providersByKey.set(mapKey, {
					slug: createDisposableProviderSlug(providerKey.key, providerKey.type),
					pathSlug: createDisposableProviderPathSlug(providerKey.key, providerKey.type),
					type: providerKey.type,
					key: providerKey.key,
					label: providerKey.label,
					domains: [],
					firstSeenAt: null,
					lastSeenAt: null,
					lastEnrichedAt: null
				})
			}

			const provider = providersByKey.get(mapKey)
			provider.domains.push(domainEntry)
			provider.firstSeenAt = earliestTimestamp(provider.firstSeenAt, domainEntry.firstSeenAt)
			provider.lastSeenAt = latestTimestamp(provider.lastSeenAt, domainEntry.lastSeenAt)
			provider.lastEnrichedAt = latestTimestamp(provider.lastEnrichedAt, domainEntry.lastEnrichedAt)
		}
	}

	const providers = [...providersByKey.values()].map(provider => {
		const domainsByName = new Map()
		for(const domain of provider.domains) {
			domainsByName.set(domain.domain, domainsByName.has(domain.domain)
				? mergeDisposableProviderDomainEntry(domainsByName.get(domain.domain), domain)
				: domain)
		}
		const domains = [...domainsByName.values()].sort((left, right) => (
			compareTimestampDesc(left.firstSeenAt, right.firstSeenAt) ||
			left.domain.localeCompare(right.domain)
		))
		return {
			...provider,
			domainCount: domains.length,
			sourceDomainCount: domains.reduce((count, domain) => count + domain.sourceDomains.length, 0),
			domains,
			mxHosts: collectProviderInfrastructure(domains, "mxHosts"),
			mxIpv4: collectProviderInfrastructure(domains, "mxIpv4"),
			mxIpv6: collectProviderInfrastructure(domains, "mxIpv6")
		}
	})

	providers.sort((left, right) => (
		right.domainCount - left.domainCount ||
		left.label.localeCompare(right.label)
	))

	return providers
}

export function findDisposableProviderBySlug(profiles, slug) {
	const normalizedSlug = normalizeString(slug).toLowerCase()
	if(!normalizedSlug) return null
	return createDisposableProviderDirectory(profiles)
		.find(provider => provider.slug === normalizedSlug || provider.pathSlug === normalizedSlug) || null
}

export function selectDisposableBackfillDomains(domains, profilesByDomain, {
	includeEnriched = false,
	resumeAfter = null
} = {}) {
	const normalizedResumeAfter = normalizeDisposableDomain(resumeAfter)
	const getProfile = (domain) => {
		if(profilesByDomain instanceof Map) return profilesByDomain.get(domain) || null
		return profilesByDomain?.[domain] || null
	}

	return sortDisposableDomains(domains).filter(domain => {
		if(normalizedResumeAfter && domain.localeCompare(normalizedResumeAfter) <= 0) return false
		if(includeEnriched) return true
		const profile = getProfile(domain)
		if(!profile) return true
		if(profile.lastEnrichmentError) return true
		return !profile.lastEnrichedAt
	})
}

export function selectDisposableShardDomains(domains, {
	shardCount = 1,
	shardIndex = 0
} = {}) {
	const normalizedShardCount = normalizePositiveInteger(shardCount, 1)
	const parsedShardIndex = Number(shardIndex)
	const normalizedShardIndex = Number.isInteger(parsedShardIndex) && parsedShardIndex >= 0
		? parsedShardIndex
		: 0
	if(normalizedShardCount === 1) return sortDisposableDomains(domains)
	if(normalizedShardIndex >= normalizedShardCount) return []

	return sortDisposableDomains(domains).filter(domain =>
		hashToUInt32(domain) % normalizedShardCount === normalizedShardIndex
	)
}

export function hasFreshDisposableMxSnapshot(profile, {
	now = new Date(),
	maxAgeMs = DISPOSABLE_WEEK_MS
} = {}) {
	const resolvedAtMs = toTimestampMs(profile?.mxResolvedAt)
	if(!Number.isFinite(resolvedAtMs)) return false
	if(!Array.isArray(profile?.mxResolvedRecords) || profile.mxResolvedRecords.length === 0) return false
	const ageMs = Math.max(0, normalizeTimestampMs(now) - resolvedAtMs)
	return ageMs <= Math.max(0, Number(maxAgeMs) || 0)
}

export function shouldRefreshDisposableMxSnapshot(previousProfile, nextProfile, {
	now = new Date(),
	maxAgeMs = DISPOSABLE_WEEK_MS
} = {}) {
	const nextMxRecords = normalizeMxRecords(nextProfile?.mxRecords)
	if(nextMxRecords.length === 0) return false
	if(!hasFreshDisposableMxSnapshot(previousProfile, {
		now,
		maxAgeMs
	})) return true

	const previousMxRecords = normalizeMxRecords(previousProfile?.mxRecords)
	if(previousMxRecords.length !== nextMxRecords.length) return true

	return previousMxRecords.some((record, index) => (
		record.exchange !== nextMxRecords[index].exchange ||
		record.priority !== nextMxRecords[index].priority
	))
}

export function queueDisposableMxRefresh(profile, {
	now = new Date(),
	delayMs = 0
} = {}) {
	if(!profile?.isDisposable || normalizeMxRecords(profile?.mxRecords).length === 0) {
		return {
			...profile,
			nextMxRefreshAt: null,
			mxResolvedAt: null,
			mxResolvedRecords: []
		}
	}

	return {
		...profile,
		nextMxRefreshAt: scheduleDisposableMxRefresh(now, delayMs)
	}
}

export function clearDisposableMxRefreshSchedule(profile) {
	return {
		...profile,
		nextMxRefreshAt: null
	}
}

export function resolveDisposableLookupState(input, {
	isDisposable = false,
	profile = null
} = {}) {
	const domain = extractDisposableLookupDomain(input)
	if(!domain) {
		return {
			input: normalizeString(input),
			domain: null,
			state: "invalid",
			profile: null
		}
	}

	const publicProfile = toPublicDisposableProfile(profile)
	if(!isDisposable) {
		return {
			input: normalizeString(input),
			domain,
			state: "not_disposable",
			profile: publicProfile
		}
	}

	if(publicProfile?.lastEnrichedAt) {
		return {
			input: normalizeString(input),
			domain,
			state: "disposable_enriched",
			profile: publicProfile
		}
	}

	return {
		input: normalizeString(input),
		domain,
		state: "disposable_pending",
		profile: publicProfile
	}
}
