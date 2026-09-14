import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
	createDisposableProviderDirectory,
	createDisposableProfile,
	DISPOSABLE_PROVIDER_DETAIL_PREFIX,
	DISPOSABLE_PROVIDER_INDEX_KEY,
	getDisposableProviderDetailKey,
	normalizeDisposableDomain,
	sortDisposableDomains,
	toPublicDisposableProfile
} from "@repo/core/disposable-domains"

import {
	assertDisposableDomainProfileSchema,
	loadDisposableProfiles,
	saveDisposableProfiles
} from "./disposable-emails.js"
import {
	createCachedAddressResolveFns,
	createDnsResolveFns,
	parseDnsServers,
	refreshDisposableMxProfiles
} from "./disposable-mx-full-refresh.js"

const DEFAULT_SOURCE_URL = "https://raw.githubusercontent.com/gtkppr/email-disposable/refs/heads/main/disposable.json"
const DEFAULT_SOURCE_PACKAGE_URL = "https://raw.githubusercontent.com/gtkppr/email-disposable/refs/heads/main/package.json"
const DEFAULT_BRANCH = "main"
const CSV_ARRAY_SEPARATOR = "|"
const SITE_PROVIDER_PREVIEW_LIMIT = 10
const SITE_PROVIDER_CACHE_SCAN_COUNT = 500
const DEFAULT_PREWARM_BASE_URL = "http://localhost:9999"

function normalizeString(value) {
	return typeof value === "string" ? value.trim() : ""
}

function normalizePositiveInteger(value, fallback) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeNonNegativeInteger(value, fallback = 0) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function chunkValues(values, size) {
	const chunks = []
	for(let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size))
	}
	return chunks
}

function toIso(value = new Date()) {
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function today() {
	return new Date().toISOString().slice(0, 10)
}

async function emitProgress(progressFn, message, details = {}) {
	if(!progressFn) return
	await progressFn(message, details)
}

export function runCommand(command, args, {
	cwd,
	env = process.env
} = {}) {
	const secrets = [env.DISPOSABLE_INFRASTRUCTURE_GITHUB_TOKEN, env.NODE_AUTH_TOKEN]
	for(const argument of args) {
		try {
			const url = new URL(argument)
			if(url.password) secrets.push(url.password, decodeURIComponent(url.password))
		} catch {}
	}
	const redact = value => {
		let output = String(value)
		for(const secret of secrets.filter(Boolean)) output = output.replaceAll(secret, "[REDACTED]")
		return output.replace(/(https?:\/\/)[^\s/@]+@/gi, "$1[REDACTED]@")
	}
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: "pipe"
		})
		let stdout = ""
		let stderr = ""

		child.stdout.on("data", chunk => {
			stdout += String(chunk)
		})
		child.stderr.on("data", chunk => {
			stderr += String(chunk)
		})
		child.on("error", error => {
			reject(new Error(`${command} failed to start (${error.code || "unknown error"})`))
		})
		child.on("close", code => {
			if(code === 0) {
				resolve({
					stdout: redact(stdout.trim()),
					stderr: redact(stderr.trim())
				})
				return
			}
			const error = new Error(`${command} failed with exit code ${code}`)
			error.stdout = redact(stdout.trim())
			error.stderr = redact(stderr.trim())
			reject(error)
		})
	})
}

function buildCloneUrl(repository, token) {
	const cleanedRepository = repository
		.replace(/^https:\/\/github\.com\//, "")
		.replace(/\.git$/, "")
	if(!token) return `https://github.com/${cleanedRepository}.git`
	return `https://x-access-token:${token}@github.com/${cleanedRepository}.git`
}

async function hasRepoChanges(cwd) {
	const result = await runCommand("git", ["status", "--short"], { cwd })
	return result.stdout.length > 0
}

function isMissingRemoteBranchError(error, branch) {
	const message = `${error?.message || ""}\n${error?.stderr || ""}\n${error?.stdout || ""}`
	return message.includes(`Remote branch ${branch} not found`)
}

async function cloneDestinationRepository({
	repository,
	branch,
	githubToken,
	tempDir,
	progressFn
}) {
	const cloneUrl = buildCloneUrl(repository, githubToken)
	try {
		await runCommand("git", [
			"clone",
			"--depth",
			"1",
			"--branch",
			branch,
			cloneUrl,
			tempDir
		])
		return
	} catch(error) {
		if(!isMissingRemoteBranchError(error, branch)) throw error
	}

	await emitProgress(progressFn, "destination branch missing; cloning empty repository", { repository, branch })
	await runCommand("git", [
		"clone",
		cloneUrl,
		tempDir
	])
	await runCommand("git", ["checkout", "-B", branch], { cwd: tempDir })
}

function csvEscape(value) {
	if(value == null) return ""
	const stringValue = Array.isArray(value)
		? value.join(CSV_ARRAY_SEPARATOR)
		: String(value)
	if(!/[",\n\r]/.test(stringValue)) return stringValue
	return `"${stringValue.replaceAll("\"", "\"\"")}"`
}

function writeCsv(rows, columns) {
	const header = columns.join(",")
	const body = rows.map(row => columns.map(column => csvEscape(row[column])).join(","))
	return `${[header, ...body].join("\n")}\n`
}

function writeJsonl(rows) {
	return rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "")
}

function getMxHosts(profile) {
	return [...new Set([
		...(profile?.mxRecords || []).map(record => record.exchange),
		...(profile?.mxResolvedRecords || []).map(record => record.exchange)
	].filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function getMxIps(profile, version) {
	const key = version === 6 ? "ipv6" : "ipv4"
	return [...new Set((profile?.mxResolvedRecords || []).flatMap(record => record[key] || []))]
		.sort((left, right) => left.localeCompare(right))
}

function createFallbackProfile(domain, now = new Date()) {
	return createDisposableProfile(domain, {
		now,
		isNewDomain: true
	})
}

function createEmptyPublicProfile(domain) {
	return {
		domain,
		isDisposable: true,
		firstSeenAt: null,
		lastSeenAt: null,
		lastEnrichedAt: null,
		creation: null,
		expiration: null,
		owner: null,
		status: [],
		mxRecords: [],
		mxResolvedAt: null,
		mxResolvedRecords: []
	}
}

async function fetchJson(url, fetchImpl = fetch) {
	const response = await fetchImpl(url)
	if(!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`)
	return response.json()
}

async function fetchText(url, fetchImpl = fetch) {
	const response = await fetchImpl(url)
	if(!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`)
	return response.text()
}

function parseDomainSource(value) {
	if(Array.isArray(value)) return value
	if(value && typeof value === "object") return Object.keys(value)
	return String(value)
		.split(/\r?\n/)
		.map(row => row.trim())
		.filter(row => row && !row.startsWith("#"))
}

export async function fetchEmailDisposableDomains({
	sourceUrl = DEFAULT_SOURCE_URL,
	fetchImpl = fetch
} = {}) {
	const rawValue = sourceUrl.endsWith(".json")
		? await fetchJson(sourceUrl, fetchImpl)
		: await fetchText(sourceUrl, fetchImpl)
	return sortDisposableDomains(parseDomainSource(rawValue))
}

async function fetchSourcePackageMetadata({
	sourcePackageUrl = DEFAULT_SOURCE_PACKAGE_URL,
	fetchImpl = fetch
} = {}) {
	try {
		const packageJson = await fetchJson(sourcePackageUrl, fetchImpl)
		return {
			name: packageJson?.name || "email-disposable",
			version: packageJson?.version || null
		}
	} catch {
		return {
			name: "email-disposable",
			version: null
		}
	}
}

function getProfilesToRefresh(domains, profilesByDomain, {
	limit = 0,
	now = new Date()
} = {}) {
	const targetProfiles = []
	for(const domain of domains) {
		const profile = profilesByDomain.get(domain) || createFallbackProfile(domain, now)
		const publicProfile = toPublicDisposableProfile(profile)
		if(publicProfile?.mxResolvedAt && (publicProfile.mxResolvedRecords || []).length > 0) continue
		targetProfiles.push(profile)
		if(limit > 0 && targetProfiles.length >= limit) break
	}
	return targetProfiles
}

async function refreshMissingMxProfiles(redisClient, domains, profilesByDomain, {
	env = process.env,
	now = new Date(),
	progressFn = null
} = {}) {
	const limit = normalizeNonNegativeInteger(env.DISPOSABLE_INFRASTRUCTURE_MX_REFRESH_LIMIT, 250)
	if(limit === 0) {
		return {
			attempted: 0,
			succeeded: 0,
			failed: 0,
			skipped: 0
		}
	}

	const targetProfiles = getProfilesToRefresh(domains, profilesByDomain, {
		limit,
		now
	})
	if(targetProfiles.length === 0) {
		return {
			attempted: 0,
			succeeded: 0,
			failed: 0,
			skipped: 0
		}
	}
	await emitProgress(progressFn, "selected domains for missing MX/IP refresh", {
		total: targetProfiles.length
	})

	const dnsServers = parseDnsServers(env.DISPOSABLE_INFRASTRUCTURE_DNS_SERVERS || env.DISPOSABLE_DNS_SERVERS || "")
	const dnsResolveFns = createDnsResolveFns({ dnsServers })
	const cachedAddressResolveFns = createCachedAddressResolveFns({
		resolve4Fn: dnsResolveFns.resolve4Fn,
		resolve6Fn: dnsResolveFns.resolve6Fn
	})
	const refreshResult = await refreshDisposableMxProfiles(targetProfiles, {
		concurrency: normalizePositiveInteger(env.DISPOSABLE_INFRASTRUCTURE_MX_REFRESH_CONCURRENCY, 10),
		resolveConcurrency: normalizePositiveInteger(env.DISPOSABLE_INFRASTRUCTURE_MX_RESOLVE_CONCURRENCY, 10),
		mxTimeoutMs: normalizeNonNegativeInteger(env.DISPOSABLE_INFRASTRUCTURE_MX_TIMEOUT_MS, 3000),
		ipTimeoutMs: normalizeNonNegativeInteger(env.DISPOSABLE_INFRASTRUCTURE_IP_TIMEOUT_MS, 2000),
		resolveMxFn: dnsResolveFns.resolveMxFn,
		resolve4Fn: cachedAddressResolveFns.resolve4Fn,
		resolve6Fn: cachedAddressResolveFns.resolve6Fn,
		progressFn: progress => emitProgress(progressFn, "mx refresh progress", progress),
		now
	})

	await saveDisposableProfiles(redisClient, refreshResult.profilesToSave)
	for(const profile of refreshResult.profilesToSave) {
		profilesByDomain.set(profile.domain, profile)
	}

	return {
		attempted: targetProfiles.length,
		succeeded: refreshResult.succeeded,
		failed: refreshResult.failed,
		skipped: refreshResult.skipped
	}
}

function createProviderIndex(providers) {
	const providersByDomain = new Map()

	for(const provider of providers) {
		for(const domainEntry of provider.domains || []) {
			for(const sourceDomain of domainEntry.sourceDomains || []) {
				if(!providersByDomain.has(sourceDomain)) providersByDomain.set(sourceDomain, [])
				providersByDomain.get(sourceDomain).push(provider)
			}
		}
	}

	return providersByDomain
}

function createDomainRows(domains, profilesByDomain, providersByDomain) {
	return domains.map((domain) => {
		const publicProfile = toPublicDisposableProfile(profilesByDomain.get(domain)) ||
			createEmptyPublicProfile(domain)
		const providers = providersByDomain.get(domain) || []
		return {
			domain,
			provider_slugs: providers.map(provider => provider.slug),
			provider_labels: providers.map(provider => provider.label),
			mx_hosts: getMxHosts(publicProfile),
			mx_ipv4: getMxIps(publicProfile, 4),
			mx_ipv6: getMxIps(publicProfile, 6),
			mx_resolved_at: publicProfile.mxResolvedAt || null,
			first_seen_at: publicProfile.firstSeenAt || null,
			last_seen_at: publicProfile.lastSeenAt || null,
			last_enriched_at: publicProfile.lastEnrichedAt || null
		}
	})
}

function createProviderRows(providers) {
	return providers.map(provider => ({
		slug: provider.slug,
		type: provider.type,
		key: provider.key,
		label: provider.label,
		domain_count: provider.domainCount,
		source_domain_count: provider.sourceDomainCount,
		mx_hosts: provider.mxHosts,
		mx_ipv4: provider.mxIpv4,
		mx_ipv6: provider.mxIpv6,
		first_seen_at: provider.firstSeenAt || null,
		last_seen_at: provider.lastSeenAt || null,
		last_enriched_at: provider.lastEnrichedAt || null
	}))
}

function createSiteProviderDomain(domain) {
	return {
		domain: domain.domain,
		firstSeenAt: domain.firstSeenAt || null,
		lastSeenAt: domain.lastSeenAt || null,
		lastEnrichedAt: domain.lastEnrichedAt || null,
		mxHosts: domain.mxHosts || [],
		mxIpv4: domain.mxIpv4 || [],
		mxIpv6: domain.mxIpv6 || []
	}
}

function createSiteProviderSearchText(provider) {
	return [
		provider.label,
		provider.type,
		provider.key,
		...(provider.mxHosts || []),
		...(provider.mxIpv4 || []),
		...(provider.mxIpv6 || []),
		...(provider.domains || []).flatMap(domain => [
			domain.domain,
			...(domain.sourceDomains || [])
		])
	]
		.filter(Boolean)
		.join("\n")
		.toLowerCase()
}

function createSiteProviderSummary(provider, generatedAt) {
	return {
		generatedAt,
		slug: provider.slug,
		pathSlug: provider.pathSlug,
		type: provider.type,
		key: provider.key,
		label: provider.label,
		domainCount: provider.domainCount,
		sourceDomainCount: provider.sourceDomainCount,
		firstSeenAt: provider.firstSeenAt || null,
		lastSeenAt: provider.lastSeenAt || null,
		lastEnrichedAt: provider.lastEnrichedAt || null,
		mxHosts: provider.mxHosts || [],
		mxIpv4: provider.mxIpv4 || [],
		mxIpv6: provider.mxIpv6 || [],
		domains: (provider.domains || [])
			.slice(0, SITE_PROVIDER_PREVIEW_LIMIT)
			.map(createSiteProviderDomain),
		searchText: createSiteProviderSearchText(provider)
	}
}

function createSiteProviderDetail(provider, generatedAt) {
	return {
		...createSiteProviderSummary(provider, generatedAt),
		domains: (provider.domains || []).map(createSiteProviderDomain)
	}
}

function createSiteProviderArtifacts(providers, generatedAt) {
	return {
		index: {
			generatedAt,
			providers: providers.map(provider => createSiteProviderSummary(provider, generatedAt))
		},
		details: providers.map(provider => createSiteProviderDetail(provider, generatedAt))
	}
}

function createMxHostRows(domainRows) {
	const rowsByHost = new Map()
	for(const domainRow of domainRows) {
		for(const host of domainRow.mx_hosts || []) {
			if(!rowsByHost.has(host)) {
				rowsByHost.set(host, {
					host,
					domain_count: 0,
					domains: [],
					provider_slugs: new Set(),
					provider_labels: new Set(),
					mx_ipv4: new Set(),
					mx_ipv6: new Set()
				})
			}
			const row = rowsByHost.get(host)
			row.domain_count += 1
			row.domains.push(domainRow.domain)
			for(const value of domainRow.provider_slugs) row.provider_slugs.add(value)
			for(const value of domainRow.provider_labels) row.provider_labels.add(value)
			for(const value of domainRow.mx_ipv4) row.mx_ipv4.add(value)
			for(const value of domainRow.mx_ipv6) row.mx_ipv6.add(value)
		}
	}

	return [...rowsByHost.values()]
		.map(row => ({
			...row,
			provider_slugs: [...row.provider_slugs].sort(),
			provider_labels: [...row.provider_labels].sort(),
			mx_ipv4: [...row.mx_ipv4].sort(),
			mx_ipv6: [...row.mx_ipv6].sort(),
			domains: row.domains.sort()
		}))
		.sort((left, right) => right.domain_count - left.domain_count || left.host.localeCompare(right.host))
}

async function listRedisKeys(redisClient, pattern) {
	let cursor = "0"
	const keys = []
	do {
		const [nextCursor, batch] = await redisClient.scan(
			cursor,
			"MATCH",
			pattern,
			"COUNT",
			String(SITE_PROVIDER_CACHE_SCAN_COUNT)
		)
		cursor = nextCursor
		keys.push(...batch)
	} while(cursor !== "0")
	return keys
}

async function saveSiteProviderCache(redisClient, siteProviderArtifacts, {
	progressFn = null
} = {}) {
	if(
		!redisClient ||
		!siteProviderArtifacts ||
		typeof redisClient.scan !== "function" ||
		typeof redisClient.pipeline !== "function"
	) return
	const detailKeys = await listRedisKeys(redisClient, `${DISPOSABLE_PROVIDER_DETAIL_PREFIX}*`)
	for(const keyChunk of chunkValues(detailKeys, SITE_PROVIDER_CACHE_SCAN_COUNT)) {
		if(keyChunk.length > 0) await redisClient.del(...keyChunk)
	}

	const pipeline = redisClient.pipeline()
	pipeline.set(DISPOSABLE_PROVIDER_INDEX_KEY, JSON.stringify(siteProviderArtifacts.index))
	for(const detail of siteProviderArtifacts.details) {
		pipeline.set(getDisposableProviderDetailKey(detail.slug), JSON.stringify({
			generatedAt: siteProviderArtifacts.index.generatedAt,
			provider: detail
		}))
	}
	await pipeline.exec()
	await emitProgress(progressFn, "saved disposable provider site cache", {
		providers: siteProviderArtifacts.index.providers.length,
		details: siteProviderArtifacts.details.length
	})
}

function createDisposableDataPrewarmUrls(dataset, env = process.env) {
	if(env.DISPOSABLE_INFRASTRUCTURE_PREWARM_ENABLED === "false") return []
	const configuredUrls = normalizeString(env.DISPOSABLE_INFRASTRUCTURE_PREWARM_URLS)
		.split(",")
		.map(value => value.trim())
		.filter(Boolean)
	const baseUrl = normalizeString(env.DISPOSABLE_INFRASTRUCTURE_PREWARM_BASE_URL)
		|| normalizeString(env.NEXT_PUBLIC_APP_URL)
		|| DEFAULT_PREWARM_BASE_URL
	const topProviderCount = normalizeNonNegativeInteger(env.DISPOSABLE_INFRASTRUCTURE_PREWARM_TOP_PROVIDERS, 10)
	const paths = [
		"/disposable-email-data",
		...(dataset.siteProviderArtifacts?.index?.providers || [])
			.slice(0, topProviderCount)
			.map(provider => `/disposable-email-data/${encodeURIComponent(provider.pathSlug || provider.slug)}`)
	]
	const urls = [
		...paths
			.map((pathname) => {
				try {
					return new URL(pathname, baseUrl).toString()
				} catch {
					return null
				}
			})
			.filter(Boolean),
		...configuredUrls
	]

	return [...new Set(urls)]
}

async function prewarmDisposableDataPages(dataset, {
	env = process.env,
	progressFn = null,
	fetchImpl = fetch
} = {}) {
	const urls = createDisposableDataPrewarmUrls(dataset, env)
	if(urls.length === 0) {
		return {
			attempted: 0,
			succeeded: 0,
			failed: 0
		}
	}

	const timeoutMs = normalizePositiveInteger(env.DISPOSABLE_INFRASTRUCTURE_PREWARM_TIMEOUT_MS, 10000)
	let succeeded = 0
	let failed = 0
	await emitProgress(progressFn, "prewarming disposable email data pages", { urls: urls.length })

	for(const url of urls) {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), timeoutMs)
		try {
			const response = await fetchImpl(url, {
				cache: "no-store",
				signal: controller.signal
			})
			if(response.ok) succeeded += 1
			else failed += 1
		} catch {
			failed += 1
		} finally {
			clearTimeout(timeout)
		}
	}

	await emitProgress(progressFn, "prewarmed disposable email data pages", {
		succeeded,
		failed
	})
	return {
		attempted: urls.length,
		succeeded,
		failed
	}
}

function createMxIpRows(domainRows) {
	const rowsByIp = new Map()
	for(const domainRow of domainRows) {
		for(const [version, values] of [[4, domainRow.mx_ipv4], [6, domainRow.mx_ipv6]]) {
			for(const ip of values || []) {
				if(!rowsByIp.has(ip)) {
					rowsByIp.set(ip, {
						ip,
						version,
						domain_count: 0,
						domains: [],
						provider_slugs: new Set(),
						provider_labels: new Set()
					})
				}
				const row = rowsByIp.get(ip)
				row.domain_count += 1
				row.domains.push(domainRow.domain)
				for(const value of domainRow.provider_slugs) row.provider_slugs.add(value)
				for(const value of domainRow.provider_labels) row.provider_labels.add(value)
			}
		}
	}

	return [...rowsByIp.values()]
		.map(row => ({
			...row,
			provider_slugs: [...row.provider_slugs].sort(),
			provider_labels: [...row.provider_labels].sort(),
			domains: row.domains.sort()
		}))
		.sort((left, right) => right.domain_count - left.domain_count || left.ip.localeCompare(right.ip))
}

function createSummary({
	generatedAt,
	source,
	domainRows,
	providerRows,
	mxHostRows,
	mxIpRows,
	mxRefresh
}) {
	const enrichedDomainCount = domainRows.filter(row => row.mx_hosts.length > 0 || row.mx_ipv4.length > 0 || row.mx_ipv6.length > 0).length
	return {
		generated_at: generatedAt,
		source,
		counts: {
			domains: domainRows.length,
			enriched_domains: enrichedDomainCount,
			providers: providerRows.length,
			mx_hosts: mxHostRows.length,
			mx_ips: mxIpRows.length,
			mx_ipv4: mxIpRows.filter(row => row.version === 4).length,
			mx_ipv6: mxIpRows.filter(row => row.version === 6).length
		},
		mx_refresh: mxRefresh
	}
}

function createSourcesJson({
	generatedAt,
	sourceUrl,
	sourcePackageUrl,
	sourceMetadata
}) {
	return {
		generated_at: generatedAt,
		sources: [
			{
				name: "email-disposable",
				type: "github_repository",
				repository: "https://github.com/gtkppr/email-disposable",
				domains_url: sourceUrl,
				package_url: sourcePackageUrl,
				package_name: sourceMetadata.name,
				package_version: sourceMetadata.version
			},
			{
				name: "Gatekeepr disposable MX enrichment",
				type: "derived_enrichment",
				description: "MX hostnames and resolved MX IP snapshots collected by Gatekeepr disposable-domain enrichment jobs."
			}
		]
	}
}

function createSchema({
	title,
	required,
	properties
}) {
	return {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		title,
		type: "object",
		required,
		additionalProperties: false,
		properties
	}
}

function createSchemas() {
	const nullableString = { type: ["string", "null"] }
	const stringArray = { type: "array", items: { type: "string" } }

	return {
		"domains.schema.json": createSchema({
			title: "Disposable Email Infrastructure Domain",
			required: ["domain", "provider_slugs", "provider_labels", "mx_hosts", "mx_ipv4", "mx_ipv6"],
			properties: {
				domain: { type: "string" },
				provider_slugs: stringArray,
				provider_labels: stringArray,
				mx_hosts: stringArray,
				mx_ipv4: stringArray,
				mx_ipv6: stringArray,
				mx_resolved_at: nullableString,
				first_seen_at: nullableString,
				last_seen_at: nullableString,
				last_enriched_at: nullableString
			}
		}),
		"providers.schema.json": createSchema({
			title: "Disposable Email Infrastructure Provider",
			required: ["slug", "type", "key", "label", "domain_count", "source_domain_count", "mx_hosts", "mx_ipv4", "mx_ipv6"],
			properties: {
				slug: { type: "string" },
				type: { type: "string" },
				key: { type: "string" },
				label: { type: "string" },
				domain_count: { type: "integer" },
				source_domain_count: { type: "integer" },
				mx_hosts: stringArray,
				mx_ipv4: stringArray,
				mx_ipv6: stringArray,
				first_seen_at: nullableString,
				last_seen_at: nullableString,
				last_enriched_at: nullableString
			}
		})
	}
}

function buildReadme() {
	return `# Disposable Email Infrastructure

Public disposable email infrastructure data derived from the daily [email-disposable](https://github.com/gtkppr/email-disposable) domain list and Gatekeepr MX enrichment.

## Data

- \`data/latest/domains.csv\` and \`domains.jsonl\`: disposable domains with MX hosts, MX IPs, and provider cluster references.
- \`data/latest/providers.csv\` and \`providers.jsonl\`: provider clusters inferred from MX routing infrastructure.
- \`data/latest/mx_hosts.csv\`: MX hostnames seen across disposable domains.
- \`data/latest/mx_ips.csv\`: resolved public MX IP addresses seen across disposable domains.
- \`data/latest/summary.json\`: generation timestamp and aggregate counts.
- \`data/diffs/YYYY-MM-DD/\`: daily change files compared with the previous published \`data/latest\` snapshot.
- \`data/schema/\`: JSON Schema files for JSONL rows.
- \`data/sources.json\`: upstream source and enrichment provenance.

## Update Cadence

This repository is generated daily shortly after the \`email-disposable\` package is updated.
`
}

function buildMethodology() {
	return `# Methodology

1. Fetch the latest domain list from \`email-disposable\`.
2. Normalize and de-duplicate domains.
3. Join domains against Gatekeepr disposable-domain profiles.
4. Refresh missing MX snapshots within the configured daily budget.
5. Infer provider clusters from cleaned MX hostnames and resolved public MX IPs.
6. Write latest CSV/JSONL datasets and dated diff files.

Provider clusters are inferred from mail-routing infrastructure. They are not ownership assertions.
`
}

function buildNotice() {
	return `# Notice

This dataset is generated from public disposable-domain lists and DNS-derived mail infrastructure observations.

Provider labels are inferred from MX infrastructure and may describe hosting, mail routing, or intermediary services rather than the operator of a disposable email service.
`
}

function buildContributing() {
	return `# Contributing

This repository is generated. Please propose source-list or methodology changes in the Gatekeepr project rather than editing generated files directly.

For incorrect domain or infrastructure entries, include the domain, expected result, and supporting DNS evidence.
`
}

function buildLicense() {
	return `MIT License

Copyright (c) 2026 Gatekeepr

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`
}

async function readJsonlByKey(filePath, key) {
	try {
		const content = await fs.readFile(filePath, "utf8")
		const rows = content
			.split(/\r?\n/)
			.map(row => row.trim())
			.filter(Boolean)
			.map(row => JSON.parse(row))
		return new Map(rows.map(row => [row[key], row]))
	} catch {
		return new Map()
	}
}

function diffRows(previousByKey, nextRows, key) {
	const nextByKey = new Map(nextRows.map(row => [row[key], row]))
	const added = nextRows.filter(row => !previousByKey.has(row[key]))
	const removed = [...previousByKey.values()].filter(row => !nextByKey.has(row[key]))
	const changed = nextRows.filter((row) => {
		const previous = previousByKey.get(row[key])
		return previous && JSON.stringify(previous) !== JSON.stringify(row)
	})
	return { added, removed, changed }
}

async function writeDatasetFiles(outputDir, dataset, previousLatestDir) {
	const latestDir = path.join(outputDir, "data", "latest")
	const schemaDir = path.join(outputDir, "data", "schema")
	const diffDir = path.join(outputDir, "data", "diffs", today())
	await fs.mkdir(latestDir, { recursive: true })
	await fs.mkdir(schemaDir, { recursive: true })
	await fs.mkdir(diffDir, { recursive: true })

	const domainColumns = ["domain", "provider_slugs", "provider_labels", "mx_hosts", "mx_ipv4", "mx_ipv6", "mx_resolved_at", "first_seen_at", "last_seen_at", "last_enriched_at"]
	const providerColumns = ["slug", "type", "key", "label", "domain_count", "source_domain_count", "mx_hosts", "mx_ipv4", "mx_ipv6", "first_seen_at", "last_seen_at", "last_enriched_at"]
	const mxHostColumns = ["host", "domain_count", "provider_slugs", "provider_labels", "mx_ipv4", "mx_ipv6", "domains"]
	const mxIpColumns = ["ip", "version", "domain_count", "provider_slugs", "provider_labels", "domains"]

	const previousDomains = await readJsonlByKey(path.join(previousLatestDir, "domains.jsonl"), "domain")
	const previousProviders = await readJsonlByKey(path.join(previousLatestDir, "providers.jsonl"), "slug")
	const domainDiff = diffRows(previousDomains, dataset.domainRows, "domain")
	const providerDiff = diffRows(previousProviders, dataset.providerRows, "slug")

	await fs.writeFile(path.join(latestDir, "domains.csv"), writeCsv(dataset.domainRows, domainColumns), "utf8")
	await fs.writeFile(path.join(latestDir, "domains.jsonl"), writeJsonl(dataset.domainRows), "utf8")
	await fs.writeFile(path.join(latestDir, "providers.csv"), writeCsv(dataset.providerRows, providerColumns), "utf8")
	await fs.writeFile(path.join(latestDir, "providers.jsonl"), writeJsonl(dataset.providerRows), "utf8")
	await fs.writeFile(path.join(latestDir, "mx_hosts.csv"), writeCsv(dataset.mxHostRows, mxHostColumns), "utf8")
	await fs.writeFile(path.join(latestDir, "mx_ips.csv"), writeCsv(dataset.mxIpRows, mxIpColumns), "utf8")
	await fs.writeFile(path.join(latestDir, "summary.json"), `${JSON.stringify(dataset.summary, null, 2)}\n`, "utf8")

	await fs.writeFile(path.join(diffDir, "added_domains.csv"), writeCsv(domainDiff.added, domainColumns), "utf8")
	await fs.writeFile(path.join(diffDir, "removed_domains.csv"), writeCsv(domainDiff.removed, domainColumns), "utf8")
	await fs.writeFile(path.join(diffDir, "changed_domains.csv"), writeCsv(domainDiff.changed, domainColumns), "utf8")
	await fs.writeFile(path.join(diffDir, "new_provider_clusters.csv"), writeCsv(providerDiff.added, providerColumns), "utf8")

	const schemas = createSchemas()
	for(const [filename, schema] of Object.entries(schemas)) {
		await fs.writeFile(path.join(schemaDir, filename), `${JSON.stringify(schema, null, 2)}\n`, "utf8")
	}

	await fs.writeFile(path.join(outputDir, "data", "sources.json"), `${JSON.stringify(dataset.sourcesJson, null, 2)}\n`, "utf8")
	await fs.writeFile(path.join(outputDir, "README.md"), buildReadme(), "utf8")
	await fs.writeFile(path.join(outputDir, "LICENSE"), buildLicense(), "utf8")
	await fs.writeFile(path.join(outputDir, "NOTICE.md"), buildNotice(), "utf8")
	await fs.writeFile(path.join(outputDir, "METHODOLOGY.md"), buildMethodology(), "utf8")
	await fs.writeFile(path.join(outputDir, "CONTRIBUTING.md"), buildContributing(), "utf8")

	return {
		addedDomains: domainDiff.added.length,
		removedDomains: domainDiff.removed.length,
		changedDomains: domainDiff.changed.length,
		newProviderClusters: providerDiff.added.length
	}
}

async function createInfrastructureDataset(redisClient, {
	env = process.env,
	fetchImpl = fetch,
	now = new Date(),
	progressFn = null
} = {}) {
	await assertDisposableDomainProfileSchema()

	const sourceUrl = env.DISPOSABLE_INFRASTRUCTURE_SOURCE_URL || DEFAULT_SOURCE_URL
	const sourcePackageUrl = env.DISPOSABLE_INFRASTRUCTURE_SOURCE_PACKAGE_URL || DEFAULT_SOURCE_PACKAGE_URL
	await emitProgress(progressFn, "fetching source dataset", { sourceUrl })
	const domains = await fetchEmailDisposableDomains({
		sourceUrl,
		fetchImpl
	})
	await emitProgress(progressFn, "loaded source domains", { domains: domains.length })
	await emitProgress(progressFn, "fetching source package metadata", { sourcePackageUrl })
	const sourceMetadata = await fetchSourcePackageMetadata({
		sourcePackageUrl,
		fetchImpl
	})
	await emitProgress(progressFn, "loading stored disposable profiles", { domains: domains.length })
	const profilesByDomain = await loadDisposableProfiles(redisClient, domains)
	await emitProgress(progressFn, "loaded stored disposable profiles", { profiles: profilesByDomain.size })
	await emitProgress(progressFn, "refreshing missing MX/IP snapshots", {
		limit: normalizeNonNegativeInteger(env.DISPOSABLE_INFRASTRUCTURE_MX_REFRESH_LIMIT, 250)
	})
	const mxRefresh = await refreshMissingMxProfiles(redisClient, domains, profilesByDomain, {
		env,
		now,
		progressFn
	})
	await emitProgress(progressFn, "refreshed missing MX/IP snapshots", mxRefresh)
	await emitProgress(progressFn, "building provider and infrastructure rows", { domains: domains.length })
	const profiles = domains.map(domain => profilesByDomain.get(domain) || createFallbackProfile(domain, now))
	const providers = createDisposableProviderDirectory(profiles)
	const providersByDomain = createProviderIndex(providers)
	const domainRows = createDomainRows(domains, profilesByDomain, providersByDomain)
	const providerRows = createProviderRows(providers)
	const mxHostRows = createMxHostRows(domainRows)
	const mxIpRows = createMxIpRows(domainRows)
	const generatedAt = toIso(now)
	const siteProviderArtifacts = createSiteProviderArtifacts(providers, generatedAt)
	const source = {
		name: sourceMetadata.name,
		version: sourceMetadata.version,
		url: sourceUrl,
		package_url: sourcePackageUrl
	}

	return {
		domainRows,
		providerRows,
		mxHostRows,
		mxIpRows,
		summary: createSummary({
			generatedAt,
			source,
			domainRows,
			providerRows,
			mxHostRows,
			mxIpRows,
			mxRefresh
		}),
		sourcesJson: createSourcesJson({
			generatedAt,
			sourceUrl,
			sourcePackageUrl,
			sourceMetadata
		}),
		siteProviderArtifacts
	}
}

async function copyDatasetFiles(sourceDir, outputDir) {
	await fs.mkdir(outputDir, { recursive: true })
	await fs.cp(sourceDir, outputDir, {
		force: true,
		recursive: true,
		filter: source => path.basename(source) !== ".git"
	})
}

export async function publishDisposableInfrastructure(redisClient, {
	dryRun = false,
	loggerFn = null,
	progressFn = null,
	env = process.env,
	fetchImpl = fetch
} = {}) {
	const repository = normalizeString(env.DISPOSABLE_INFRASTRUCTURE_PUBLISH_REPO)
	const branch = env.DISPOSABLE_INFRASTRUCTURE_PUBLISH_BRANCH || DEFAULT_BRANCH
	const githubToken = env.DISPOSABLE_INFRASTRUCTURE_GITHUB_TOKEN || null
	const gitName = env.DISPOSABLE_INFRASTRUCTURE_GIT_NAME || "Gatekeepr Bot"
	const gitEmail = env.DISPOSABLE_INFRASTRUCTURE_GIT_EMAIL || "bot@example.com"
	const outputDir = env.DISPOSABLE_INFRASTRUCTURE_OUTPUT_DIR
		? path.resolve(env.DISPOSABLE_INFRASTRUCTURE_OUTPUT_DIR)
		: null
	const enabled = env.DISPOSABLE_INFRASTRUCTURE_PUBLISH_ENABLED === "true"
	await emitProgress(progressFn, "creating disposable infrastructure dataset", {
		repository,
		branch,
		dryRun
	})
	const dataset = await createInfrastructureDataset(redisClient, {
		env,
		fetchImpl,
		progressFn
	})
	await saveSiteProviderCache(redisClient, dataset.siteProviderArtifacts, { progressFn })

	if(outputDir && !enabled) {
		await emitProgress(progressFn, "writing dataset to output directory", { outputDir })
		const previousLatestDir = path.join(outputDir, "data", "latest")
		const diffSummary = await writeDatasetFiles(outputDir, dataset, previousLatestDir)
		return {
			status: dryRun ? "dry_run" : "written",
			outputDir,
			summary: dataset.summary,
			diffs: diffSummary
		}
	}

	if(!enabled) {
		await emitProgress(progressFn, "publishing disabled", { repository, branch })
		return {
			status: "skipped",
			reason: "publishing_disabled",
			summary: dataset.summary
		}
	}

	if(!repository) {
		await emitProgress(progressFn, "missing publish repository, skipping push", { branch })
		return {
			status: "skipped",
			reason: "missing_repository",
			summary: dataset.summary
		}
	}

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gatekeepr-disposable-infra-"))
	try {
		await emitProgress(progressFn, "cloning destination repository", { repository, branch })
		await cloneDestinationRepository({
			repository,
			branch,
			githubToken,
			tempDir,
			progressFn
		})

		const previousLatestDir = path.join(tempDir, "data", "latest")
		await emitProgress(progressFn, "writing dataset files", { repository, branch })
		const diffSummary = await writeDatasetFiles(tempDir, dataset, previousLatestDir)
		if(outputDir) {
			await emitProgress(progressFn, "copying published dataset to output directory", { outputDir })
			await copyDatasetFiles(tempDir, outputDir)
		}

		if(!await hasRepoChanges(tempDir)) {
			await emitProgress(progressFn, "no destination changes detected", { repository, branch })
			return {
				status: "skipped",
				reason: "no_changes",
				outputDir,
				summary: dataset.summary,
				diffs: diffSummary
			}
		}

		if(dryRun) {
			await emitProgress(progressFn, "dry run prepared changes", { repository, branch })
			return {
				status: "dry_run",
				outputDir,
				summary: dataset.summary,
				diffs: diffSummary
			}
		}

		if(!githubToken) {
			await emitProgress(progressFn, "missing github token, skipping push", { repository, branch })
			return {
				status: "skipped",
				reason: "missing_github_token",
				outputDir,
				summary: dataset.summary,
				diffs: diffSummary
			}
		}

		await runCommand("git", ["config", "user.name", gitName], { cwd: tempDir })
		await runCommand("git", ["config", "user.email", gitEmail], { cwd: tempDir })
		await runCommand("git", ["add", "."], { cwd: tempDir })
		await runCommand("git", ["commit", "-m", `update disposable infrastructure ${today()}`], { cwd: tempDir })
		await emitProgress(progressFn, "pushing destination repository", { repository, branch })
		await runCommand("git", ["push", "-u", "origin", branch], { cwd: tempDir })
		const prewarm = await prewarmDisposableDataPages(dataset, {
			env,
			progressFn,
			fetchImpl
		})

		if(loggerFn) {
			await loggerFn(
				`disposable-infrastructure: published ${repository} (${dataset.summary.counts.domains} domains, ${dataset.summary.counts.providers} providers).`,
				env.SLACK_STATUS_CRON
			)
		}

		return {
			status: "published",
			outputDir,
			prewarm,
			summary: dataset.summary,
			diffs: diffSummary
		}
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true })
	}
}
