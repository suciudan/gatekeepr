import { whoisDomain } from "whoiser"
import dns from "dns/promises"
import { isIP } from "node:net"
import moment from "moment"

const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json"
const RDAP_HEADERS = {
	"User-Agent": "gatekeepr-rdap/1.0",
	"Accept": "application/rdap+json, application/json"
}
const DOH_HEADERS = {
	"User-Agent": "gatekeepr-dns/1.0",
	"Accept": "application/dns-json, application/json"
}
const DOH_MX_PROVIDERS = [
	(domain) => `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
	(domain) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`
]
const WHOIS_DATE_FORMATS = [
	"YYYY-MM-DD[T]HH:mm:ss[Z]",
	"YYYY-MM-DD[T]HH:mm:ss.SSS[Z]",
	"YYYY-MM-DD[T]HH:mm:ssZ",
	"YYYY-MM-DD[T]HH:mm:ss.SSSZ",
	"YYYY-MM-DD HH:mm:ss",
	"YYYY-MM-DD",
	"YYYY.MM.DD HH:mm:ss",
	"YYYY.MM.DD",
	"YYYY/MM/DD HH:mm:ss",
	"YYYY/MM/DD",
	"DD.MM.YYYY HH:mm:ss",
	"DD.MM.YYYY",
	"DD/MM/YYYY HH:mm:ss",
	"DD/MM/YYYY",
	"MM/DD/YYYY HH:mm:ss",
	"MM/DD/YYYY",
	"DD-MMM-YYYY",
	"DD-MMM-YYYY HH:mm:ss",
	"DD MMM YYYY",
	"DD MMM YYYY HH:mm:ss",
	"MMM DD YYYY",
	"MMM DD YYYY HH:mm:ss",
	"ddd MMM DD HH:mm:ss [UTC] YYYY"
]
const REDACTED_OWNER_PATTERNS = [
	/\bredacted\b/i,
	/\bprivacy service\b/i,
	/\bprivacy protect\b/i,
	/\bcontact privacy\b/i,
	/\bwhoisguard\b/i,
	/\bdomains by proxy\b/i,
	/\bdata protected\b/i,
	/\bnot disclosed\b/i
]
const DEFAULT_RDAP_TIMEOUT_MS = 5000
const DEFAULT_WHOIS_TIMEOUT_MS = 8000
const DEFAULT_MX_TIMEOUT_MS = 3000
const DEFAULT_IP_TIMEOUT_MS = 2000
const DEFAULT_MX_RESOLVE_CONCURRENCY = 10

let rdapBootstrapCache = null
const rdapBootstrapCacheByFetchFn = new WeakMap()

function createTimeoutError(label, timeoutMs) {
	const error = new Error(`${label} timed out after ${timeoutMs}ms`)
	error.code = "ETIMEDOUT"
	return error
}

async function withTimeout(task, timeoutMs, label) {
	if(!Number.isFinite(timeoutMs) || timeoutMs <= 0) return task()
	return Promise.race([
		task(),
		new Promise((_, reject) => setTimeout(() => reject(createTimeoutError(label, timeoutMs)), timeoutMs))
	])
}

function normalizePositiveInteger(value, fallback) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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

async function loadRdapBootstrap(fetchFn = fetch) {
	if(fetchFn === fetch && rdapBootstrapCache) return rdapBootstrapCache
	if(fetchFn !== fetch && rdapBootstrapCacheByFetchFn.has(fetchFn)) {
		return rdapBootstrapCacheByFetchFn.get(fetchFn)
	}
	const res = await fetchFn(IANA_BOOTSTRAP_URL, { headers: RDAP_HEADERS })
	if(!res.ok) throw new Error(`IANA bootstrap HTTP ${res.status}`)
	const bootstrap = await res.json()
	if(fetchFn === fetch) rdapBootstrapCache = bootstrap
	else rdapBootstrapCacheByFetchFn.set(fetchFn, bootstrap)
	return bootstrap
}

function getTld(domain) {
	const parts = domain.toLowerCase().split(".")
	return parts.length > 1 ? parts.at(-1) : ""
}

function pickRdapBase(bootstrap, tld) {
	// IANA format: services: [ [tldArray], [baseUrls...] ]
	for(const [tlds, urls] of bootstrap.services) {
		if(tlds.includes(tld)) return urls[0].replace(/\/+$/, "")
	}
	// Some servers (rare) aren’t in services (shouldn’t happen), return null to trigger WHOIS
	return null
}

function normalizeDate(value) {
	if(!value) return null
	let candidate = String(value).trim()
	if(!candidate) return null
	candidate = candidate
		.replace(/^['"]+|['"]+$/g, "")
		.replace(/\s+\([^)]*\)\s*$/g, "")
		.replace(/\s+UTC$/i, "Z")
		.replace(/\s+/g, " ")
	const iso = moment.parseZone(candidate, moment.ISO_8601, true)
	if(iso.isValid()) return iso.toISOString()
	for(const format of WHOIS_DATE_FORMATS) {
		const parsed = moment.utc(candidate, format, true)
		if(parsed.isValid()) return parsed.toISOString()
	}
	return null
}

function normalizeText(value) {
	if(value == null) return null
	const normalized = String(value).replace(/\s+/g, " ").trim()
	return normalized || null
}

function normalizeHostname(value) {
	const normalized = normalizeText(value)
	return normalized ? normalized.replace(/\.+$/g, "").toLowerCase() : null
}

function normalizeIpList(values, version) {
	if(!Array.isArray(values)) return []
	return [...new Set(values
		.map(value => normalizeText(value)?.toLowerCase() || null)
		.filter(value => isIP(value || "") === version))]
		.sort((left, right) => left.localeCompare(right))
}

function sanitizeOwnerValue(value) {
	const normalized = normalizeText(value)
	if(!normalized) return null
	if(normalized === "-" || /^n\/?a$/i.test(normalized)) return null
	if(normalized.includes("@")) return null
	if(/^https?:\/\//i.test(normalized)) return null
	if(REDACTED_OWNER_PATTERNS.some(pattern => pattern.test(normalized))) return null
	return normalized
}

function parseWhoisField(text, patterns) {
	for(const pattern of patterns) {
		const match = text.match(pattern)
		const normalized = normalizeDate(match?.[1])
		if(normalized) return normalized
	}
	return null
}

function findNormalizedDateInText(value) {
	const text = normalizeText(value)
	if(!text) return null
	const candidates = [
		...text.matchAll(/\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g),
		...text.matchAll(/\b\d{4}[./]\d{2}[./]\d{2}(?:\s+\d{2}:\d{2}:\d{2})?\b/g),
		...text.matchAll(/\b\d{2}[./]\d{2}[./]\d{4}(?:\s+\d{2}:\d{2}:\d{2})?\b/g),
		...text.matchAll(/\b\d{1,2}-[A-Za-z]{3}-\d{4}(?:\s+\d{2}:\d{2}:\d{2})?\b/g),
		...text.matchAll(/\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}(?:\s+\d{2}:\d{2}:\d{2})?\b/g),
		...text.matchAll(/\b[A-Za-z]{3}\s+\d{1,2}\s+\d{4}(?:\s+\d{2}:\d{2}:\d{2})?\b/g)
	].map(match => match[0])

	for(const candidate of candidates) {
		const normalized = normalizeDate(candidate)
		if(normalized) return normalized
	}
	return null
}

function parseWhoisStatusExpiration(text) {
	for(const match of text.matchAll(/^\s*(?:Domain\s+)?Status:\s*(.+)$/gim)) {
		const normalized = findNormalizedDateInText(match?.[1])
		if(normalized) return normalized
	}
	return null
}

function parseWhoisTextField(text, patterns) {
	for(const pattern of patterns) {
		const match = text.match(pattern)
		const normalized = sanitizeOwnerValue(match?.[1])
		if(normalized) return normalized
	}
	return null
}

function parseRdapEventDate(events, matchers, selector = "first") {
	const values = events
		.filter(event => matchers.some(matcher => matcher(String(event?.eventAction || "").toLowerCase())))
		.map(event => normalizeDate(event?.eventDate))
		.filter(Boolean)
		.sort()
	if(!values.length) return null
	return selector === "last" ? values.at(-1) : values[0]
}

function flattenVcardValue(value) {
	if(Array.isArray(value)) {
		const items = value.map(flattenVcardValue).filter(Boolean)
		return items.length ? items.join(" ") : null
	}
	return normalizeText(value)
}

function collectRdapEntities(entities, out = []) {
	for(const entity of Array.isArray(entities) ? entities : []) {
		if(!entity || typeof entity !== "object") continue
		out.push(entity)
		collectRdapEntities(entity.entities, out)
	}
	return out
}

function getRdapEntityFieldValues(entity, fieldNames) {
	const values = []
	const entries = Array.isArray(entity?.vcardArray?.[1]) ? entity.vcardArray[1] : []
	const names = new Set(fieldNames.map(fieldName => fieldName.toLowerCase()))
	for(const entry of entries) {
		const fieldName = String(entry?.[0] || "").toLowerCase()
		if(!names.has(fieldName)) continue
		const value = flattenVcardValue(entry?.[3])
		if(value) values.push(value)
	}
	return values
}

function parseRdapOwner(data) {
	const entities = collectRdapEntities(data?.entities)
	const registrantEntities = entities.filter(entity => {
		const roles = Array.isArray(entity?.roles) ? entity.roles.map(role => String(role).toLowerCase()) : []
		return roles.some(role =>
			role.includes("registrant") ||
			role.includes("holder") ||
			role === "owner"
		)
	})
	for(const entity of registrantEntities) {
		const candidates = [
			...getRdapEntityFieldValues(entity, ["org"]),
			...getRdapEntityFieldValues(entity, ["fn"])
		]
		for(const candidate of candidates) {
			const owner = sanitizeOwnerValue(candidate)
			if(owner) return owner
		}
	}
	return null
}

function parseRdapDates(data) {
	const events = Array.isArray(data?.events) ? data.events : []
	return {
		creation: parseRdapEventDate(events, [
			action => action.includes("registration"),
			action => action.includes("creation"),
			action => action.includes("created")
		]),
		expiration: parseRdapEventDate(events, [
			action => action.includes("expiration"),
			action => action.includes("expiry"),
			action => action.includes("expires"),
			action => action.includes("renewal")
		], "last")
	}
}

function parseWhoisCreation(text) {
	const patterns = [
		/^\s*Creation Date:\s*(.+)$/im,
		/^\s*Created Date:\s*(.+)$/im,
		/^\s*Created On:\s*(.+)$/im,
		/^\s*Registered On:\s*(.+)$/im,
		/^\s*Registered Date:\s*(.+)$/im,
		/^\s*Registration Date:\s*(.+)$/im,
		/^\s*Record created on:\s*(.+)$/im,
		/^\s*Domain Create Date:\s*(.+)$/im,
		/^\s*Domain Registration Date:\s*(.+)$/im,
		/^\s*domain_datecreated:\s*(.+)$/im,
		/^\s*domain_dateregistered:\s*(.+)$/im,
		/^\s*created:\s*(.+)$/im
	]
	return parseWhoisField(text, patterns)
}

function parseWhoisOwner(text) {
	const patterns = [
		/^\s*Registrant Organization(?: Name)?:\s*(.+)$/im,
		/^\s*Registrant Org(?:anization)?:\s*(.+)$/im,
		/^\s*Registrant Contact Organization:\s*(.+)$/im,
		/^\s*registrant-organization:\s*(.+)$/im,
		/^\s*Registrant Name:\s*(.+)$/im,
		/^\s*Registrant Contact Name:\s*(.+)$/im,
		/^\s*registrant-name:\s*(.+)$/im,
		/^\s*Registrant:\s*(.+)$/im,
		/^\s*Holder Name:\s*(.+)$/im,
		/^\s*Owner(?: Name)?:\s*(.+)$/im,
		/^\s*owner-org:\s*(.+)$/im
	]
	return parseWhoisTextField(text, patterns)
}

async function rdapQuery(domain, {
	fetchFn = fetch,
	rdapTimeoutMs = DEFAULT_RDAP_TIMEOUT_MS
} = {}) {
	const bootstrap = await withTimeout(
		() => loadRdapBootstrap(fetchFn),
		rdapTimeoutMs,
		"RDAP bootstrap"
	)
	const tld = getTld(domain)
	const base = pickRdapBase(bootstrap, tld)
	if(!base) return { creation: null, expiration: null, status: [], owner: null, raw: null, source: "rdap" }
	
	// Most servers expose /domain/<fqdn>
	// Example for .dev: https://rdap.nic.google/dev/domain/jeco.dev
	const url = `${base}/domain/${encodeURIComponent(domain)}`
	const res = await withTimeout(
		() => fetchFn(url, { headers: RDAP_HEADERS }),
		rdapTimeoutMs,
		`RDAP lookup for ${domain}`
	)
	if(res.status === 404) return { creation: null, expiration: null, status: [], owner: null, source: "rdap", raw: null }
	if(!res.ok) throw new Error(`RDAP HTTP ${res.status}`)
	
	const json = await withTimeout(
		() => res.json(),
		rdapTimeoutMs,
		`RDAP response parse for ${domain}`
	)
	const { creation, expiration } = parseRdapDates(json)
	const status = parseRdapStatus(json)
	const owner = parseRdapOwner(json)
	
	return { creation, expiration, status, owner, raw: json, source: "rdap" }
}

function parseWhoisExpiration(text) {
	// Handle many registries (gTLDs and common ccTLD patterns)
	const patterns = [
		/^\s*Registry Expiry Date:\s*(.+)$/im,
		/^\s*Registrar Registration Expiration Date:\s*(.+)$/im,
		/^\s*Expiration Date:\s*(.+)$/im,
		/^\s*Expiry Date:\s*(.+)$/im,
		/^\s*Domain Expiration Date:\s*(.+)$/im,
		/^\s*Expires On:\s*(.+)$/im,
		/^\s*Expires:\s*(.+)$/im,
		/^\s*renewal date:\s*(.+)$/im,
		/^\s*paid-till:\s*(.+)$/im,
		/^\s*expire:\s*(.+)$/im,
		/^\s*expires:\s*(.+)$/im
	]
	return parseWhoisField(text, patterns) || parseWhoisStatusExpiration(text)
}

function parseWhoisStatus(text) {
	const statuses = new Set()
	const patterns = [
		/^\s*Domain Status:\s*([A-Za-z0-9\-]+)/gim,
		/^\s*Status:\s*([A-Za-z0-9\-]+)/gim // .lt
	]
	for(const re of patterns) {
		for(const match of text.matchAll(re)) {
			if(match?.[1]) statuses.add(match[1].toLowerCase())
		}
	}
	return [...statuses]
}

function parseRdapStatus(data) {
	return Array.isArray(data?.status) ? [...new Set(data.status.map(status => String(status).toLowerCase()))] : []
}

async function whoisFallback(domain, {
	whoisLookup = whoisDomain,
	whoisTimeoutMs = DEFAULT_WHOIS_TIMEOUT_MS
} = {}) {
	try {
		let text = await withTimeout(
			() => whoisLookup(domain, { raw: true }),
			whoisTimeoutMs,
			`WHOIS lookup for ${domain}`
		)
		if(text && typeof text === "object") {
			const key = Object.keys(text)[0]
			text = text[key].__raw
		}
		const expiration = parseWhoisExpiration(text || "")
		const creation = parseWhoisCreation(text || "")
		const owner = parseWhoisOwner(text || "")
		const status = parseWhoisStatus(text || "")
		return { creation, expiration, status, owner, source: "whois", raw: text }
	} catch (e) {
		return { creation: null, expiration: null, status: [], owner: null, source: "whois", raw: String(e) }
	}
}

async function resolveDns(domain, {
	fetchFn = fetch,
	resolveMxFn = dns.resolveMx,
	mxTimeoutMs = DEFAULT_MX_TIMEOUT_MS
} = {}) {
	const out = {}
	// Query a few common types; ignore failures per type
	const tasks = [
		["A", () => dns.resolve4(domain)],
		["AAAA", () => dns.resolve6(domain)],
		["MX", () => resolveMxRecords(domain, {
			resolveMxFn,
			fetchFn,
			mxTimeoutMs
		})],
		["TXT", () => dns.resolveTxt(domain)],
		["NS", () => dns.resolveNs(domain)],
		["CNAME", () => dns.resolveCname(domain)]
	]
	for (const [type, fn] of tasks) {
		try { out[type] = await fn() } catch {}
	}
	return out
}

function normalizeMxRecords(records) {
	return (Array.isArray(records) ? records : [])
		.map(record => ({
			exchange: normalizeHostname(record?.exchange),
			priority: Number(record?.priority)
		}))
		.filter(record => record.exchange)
		.map(record => ({
			exchange: record.exchange,
			priority: Number.isFinite(record.priority) ? record.priority : 0
		}))
		.sort((left, right) => {
			if(left.priority !== right.priority) return left.priority - right.priority
			return left.exchange.localeCompare(right.exchange)
		})
}

function normalizeMxResolvedRecords(records) {
	return (Array.isArray(records) ? records : [])
		.map(record => ({
			exchange: normalizeHostname(record?.exchange),
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

function parseDohMxAnswer(answer) {
	if(answer?.type !== 15) return null
	const normalized = normalizeText(answer?.data)
	if(!normalized) return null
	const match = normalized.match(/^(\d+)\s+(.+)$/)
	if(!match) return null
	const exchange = normalizeHostname(match[2])
	if(!exchange) return null
	return {
		exchange,
		priority: Number(match[1])
	}
}

async function resolveMxRecordsViaDoh(domain, {
	fetchFn = fetch,
	mxTimeoutMs = DEFAULT_MX_TIMEOUT_MS
} = {}) {
	for(const buildUrl of DOH_MX_PROVIDERS) {
		try {
			const response = await withTimeout(
				() => fetchFn(buildUrl(domain), { headers: DOH_HEADERS }),
				mxTimeoutMs,
				`MX DNS-over-HTTPS lookup for ${domain}`
			)
			if(!response.ok) continue
			const json = await withTimeout(
				() => response.json(),
				mxTimeoutMs,
				`MX DNS-over-HTTPS parse for ${domain}`
			)
			if(Number(json?.Status) !== 0 && !Array.isArray(json?.Answer)) continue
			return normalizeMxRecords((json?.Answer || [])
				.map(parseDohMxAnswer)
				.filter(Boolean))
		} catch {}
	}
	return []
}

async function resolveMxRecords(domain, {
	resolveMxFn = dns.resolveMx,
	fetchFn = fetch,
	mxTimeoutMs = DEFAULT_MX_TIMEOUT_MS
} = {}) {
	try {
		return normalizeMxRecords(await withTimeout(
			() => resolveMxFn(domain),
			mxTimeoutMs,
			`MX lookup for ${domain}`
		))
	} catch {
		return resolveMxRecordsViaDoh(domain, {
			fetchFn,
			mxTimeoutMs
		})
	}
}

async function resolveHostnameAddresses(hostname, {
	resolve4Fn = dns.resolve4,
	resolve6Fn = dns.resolve6,
	ipTimeoutMs = DEFAULT_IP_TIMEOUT_MS
} = {}) {
	const [ipv4, ipv6] = await Promise.all([
		Promise.resolve()
			.then(() => withTimeout(
				() => resolve4Fn(hostname),
				ipTimeoutMs,
				`IPv4 lookup for ${hostname}`
			))
			.catch(() => []),
		Promise.resolve()
			.then(() => withTimeout(
				() => resolve6Fn(hostname),
				ipTimeoutMs,
				`IPv6 lookup for ${hostname}`
			))
			.catch(() => [])
	])

	return {
		ipv4: normalizeIpList(ipv4, 4),
		ipv6: normalizeIpList(ipv6, 6)
	}
}

async function resolveMxInfrastructureSnapshot(mxRecords, {
	resolve4Fn = dns.resolve4,
	resolve6Fn = dns.resolve6,
	ipTimeoutMs = DEFAULT_IP_TIMEOUT_MS,
	resolveConcurrency = DEFAULT_MX_RESOLVE_CONCURRENCY,
	now = new Date()
} = {}) {
	const snapshotDate = new Date(now)
	const mxResolvedAt = Number.isNaN(snapshotDate.getTime())
		? new Date().toISOString()
		: snapshotDate.toISOString()
	const normalizedMxRecords = normalizeMxRecords(mxRecords)
	const mxResolvedRecords = await mapWithConcurrency(normalizedMxRecords, resolveConcurrency, async (record) => {
		const addresses = await resolveHostnameAddresses(record.exchange, {
			resolve4Fn,
			resolve6Fn,
			ipTimeoutMs
		})
		return {
			exchange: record.exchange,
			priority: record.priority,
			ipv4: addresses.ipv4,
			ipv6: addresses.ipv6
		}
	})

	return {
		mxResolvedAt,
		mxResolvedRecords: normalizeMxResolvedRecords(mxResolvedRecords)
	}
}

export async function getDomainMxSnapshot(domain, {
	includeResolved = true,
	fetchFn = fetch,
	resolveMxFn = dns.resolveMx,
	resolve4Fn = dns.resolve4,
	resolve6Fn = dns.resolve6,
	mxTimeoutMs = DEFAULT_MX_TIMEOUT_MS,
	ipTimeoutMs = DEFAULT_IP_TIMEOUT_MS,
	resolveConcurrency = DEFAULT_MX_RESOLVE_CONCURRENCY,
	now = new Date()
} = {}) {
	const mxRecords = await resolveMxRecords(domain, {
		resolveMxFn,
		fetchFn,
		mxTimeoutMs
	})
	if(!includeResolved) {
		return {
			domain,
			mxRecords,
			mxResolvedAt: null,
			mxResolvedRecords: []
		}
	}

	const snapshot = await resolveMxInfrastructureSnapshot(mxRecords, {
		resolve4Fn,
		resolve6Fn,
		ipTimeoutMs,
		resolveConcurrency,
		now
	})

	return {
		domain,
		mxRecords,
		mxResolvedAt: snapshot.mxResolvedAt,
		mxResolvedRecords: snapshot.mxResolvedRecords
	}
}

export async function getDomainInfo(domain, {
	includeDns = true,
	includeMx = false,
	includeMxResolved = false,
	includeOwner = false,
	fetchFn = fetch,
	whoisLookup = whoisDomain,
	resolveDnsFn = resolveDns,
	resolveMxFn = dns.resolveMx,
	resolve4Fn = dns.resolve4,
	resolve6Fn = dns.resolve6,
	rdapTimeoutMs = DEFAULT_RDAP_TIMEOUT_MS,
	whoisTimeoutMs = DEFAULT_WHOIS_TIMEOUT_MS,
	mxTimeoutMs = DEFAULT_MX_TIMEOUT_MS,
	ipTimeoutMs = DEFAULT_IP_TIMEOUT_MS,
	resolveConcurrency = DEFAULT_MX_RESOLVE_CONCURRENCY
} = {}) {
	// 1) Try RDAP (works for .dev and most TLDs)
	let rdap
	try {
		rdap = await rdapQuery(domain, {
			fetchFn,
			rdapTimeoutMs
		})
	} catch(error) {
		rdap = {
			creation: null,
			expiration: null,
			status: [],
			owner: null,
			raw: null,
			source: "rdap",
			error: error.message
		}
	}
	
	// 2) Merge in WHOIS when RDAP is incomplete
	let whoisData = null
	if(!rdap.creation || !rdap.expiration || (includeOwner && !rdap.owner)) {
		whoisData = await whoisFallback(domain, {
			whoisLookup,
			whoisTimeoutMs
		})
	}
	const creation = rdap.creation || whoisData?.creation || null
	const expiration = rdap.expiration || whoisData?.expiration || null
	const owner = includeOwner ? (rdap.owner || whoisData?.owner || null) : null
	const status = [...new Set([...(rdap.status || []), ...(whoisData?.status || [])])]
	
	const result = {
		domain,
		creation,
		expiration,
		expirationSource: expiration ? (rdap.expiration ? "RDAP" : (whoisData?.expiration ? "WHOIS" : null)) : null,
		owner,
		status,
		mxRecords: null,
		mxResolvedAt: null,
		mxResolvedRecords: [],
		rdapRaw: rdap.raw,
		rdapError: rdap.error || null,
		whoisRaw: whoisData?.raw
	}
	
	if(includeDns) {
		result.dns = await resolveDnsFn(domain, {
			fetchFn,
			resolveMxFn,
			mxTimeoutMs
		})
		result.mxRecords = normalizeMxRecords(result.dns?.MX)
	} else if(includeMx || includeMxResolved) {
		const mxSnapshot = await getDomainMxSnapshot(domain, {
			includeResolved: includeMxResolved,
			resolveMxFn,
			resolve4Fn,
			resolve6Fn,
			fetchFn,
			mxTimeoutMs,
			ipTimeoutMs,
			resolveConcurrency
		})
		result.mxRecords = mxSnapshot.mxRecords
		result.mxResolvedAt = mxSnapshot.mxResolvedAt
		result.mxResolvedRecords = mxSnapshot.mxResolvedRecords
	}

	if(includeDns && includeMxResolved) {
		const mxSnapshot = await resolveMxInfrastructureSnapshot(result.mxRecords, {
			resolve4Fn,
			resolve6Fn,
			ipTimeoutMs,
			resolveConcurrency
		})
		result.mxResolvedAt = mxSnapshot.mxResolvedAt
		result.mxResolvedRecords = mxSnapshot.mxResolvedRecords
	}
	
	return result
}

export const __testables = {
	normalizeDate,
	normalizeMxRecords,
	parseDohMxAnswer,
	findNormalizedDateInText,
	parseRdapDates,
	parseRdapOwner,
	parseRdapStatus,
	parseWhoisCreation,
	parseWhoisExpiration,
	parseWhoisOwner,
	parseWhoisStatus
}
