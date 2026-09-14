import redis from "./redis.js"

export const BROWSER_VERSIONS_KEY = "browser_versions:v1"
export const BROWSER_VERSIONS_SCHEMA_VERSION = 2
export const BROWSER_VERSION_DATA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export const DEFAULT_BROWSER_VERSION_POLICY = {
	allowedMajorLag: 2,
	outdatedMajorLag: 3,
	unsupportedMajorLag: 6,
	maxFutureMajorLag: 1
}

export const BROWSER_VERSION_ASSESSMENT_POLICY = {
	type: "major-version-lag-heuristic",
	source: "gatekeepr-internal-policy",
	sourceUrl: null,
	description: "Gatekeepr classifies outdated and unsupported browser claims by comparing the user-agent major version with the current major version. This is not vendor EOL data."
}

export const BROWSER_VERSION_SOURCES = {
	chrome: {
		source: "chrome-versionhistory",
		sourceUrl: "https://versionhistory.googleapis.com/v1/chrome/platforms/all/channels/stable/versions"
	},
	firefox: {
		source: "mozilla-product-details",
		sourceUrl: "https://product-details.mozilla.org/1.0/firefox_versions.json"
	},
	edge: {
		source: "edge-updates-api",
		sourceUrl: "https://edgeupdates.microsoft.com/api/products"
	},
	safari: {
		source: "apple-safari-release-notes",
		sourceUrl: "https://developer.apple.com/tutorials/data/documentation/safari-release-notes.json"
	},
	samsung: {
		source: "samsung-release-notes",
		sourceUrl: "https://developer.samsung.com/internet/release-note/windows-release-note.html"
	},
	opera: {
		source: "opera-desktop-index",
		sourceUrl: "https://get.geo.opera.com/pub/opera/desktop/"
	}
}

const BROWSER_NAMES = {
	chrome: "Chrome",
	firefox: "Firefox",
	edge: "Edge",
	safari: "Safari",
	samsung: "Samsung Internet",
	opera: "Opera"
}

const BROWSER_PLATFORMS = {
	chrome: ["desktop", "android", "ios"],
	firefox: ["desktop", "android", "ios"],
	edge: ["desktop", "android", "ios"],
	safari: ["desktop", "ios"],
	samsung: ["desktop", "android"],
	opera: ["desktop"]
}

function normalizeVersion(value) {
	if(value == null) return null
	const match = String(value).trim().match(/\d+(?:\.\d+)*/)
	return match ? match[0] : null
}

function getMajorVersion(version) {
	const normalized = normalizeVersion(version)
	if(!normalized) return null
	const major = Number(normalized.split(".")[0])
	return Number.isInteger(major) && major >= 0 ? major : null
}

function compareVersions(left, right) {
	const leftParts = normalizeVersion(left)?.split(".").map(Number) || []
	const rightParts = normalizeVersion(right)?.split(".").map(Number) || []
	const length = Math.max(leftParts.length, rightParts.length)
	for(let index = 0; index < length; index++) {
		const diff = (leftParts[index] || 0) - (rightParts[index] || 0)
		if(diff !== 0) return diff
	}
	return 0
}

function pickLatestVersion(values) {
	const versions = [...new Set((Array.isArray(values) ? values : [])
		.map(normalizeVersion)
		.filter(Boolean))]
	return versions.sort(compareVersions).at(-1) || null
}

function uniqueMajors(values) {
	return [...new Set((Array.isArray(values) ? values : [])
		.map(getMajorVersion)
		.filter(value => Number.isInteger(value)))]
		.sort((left, right) => left - right)
}

function collectObjectVersions(value, out = []) {
	if(Array.isArray(value)) {
		for(const item of value) collectObjectVersions(item, out)
		return out
	}
	if(!value || typeof value !== "object") return out
	for(const [key, entry] of Object.entries(value)) {
		if(/version/i.test(key) && typeof entry === "string") {
			const version = normalizeVersion(entry)
			if(version) out.push(version)
		}
		collectObjectVersions(entry, out)
	}
	return out
}

function normalizeBrowserEntry(key, {
	latestVersion,
	supportedEsrMajors = [],
	sourceFetchedAt,
	notes = null
} = {}, policy = DEFAULT_BROWSER_VERSION_POLICY) {
	const normalizedVersion = normalizeVersion(latestVersion)
	const latestMajor = getMajorVersion(normalizedVersion)
	if(!normalizedVersion || !Number.isInteger(latestMajor)) return null
	const source = BROWSER_VERSION_SOURCES[key]
	const normalizedPolicy = {
		...DEFAULT_BROWSER_VERSION_POLICY,
		...(policy || {})
	}
	const normalizedSupportedEsrMajors = uniqueMajors(supportedEsrMajors)
	return {
		name: BROWSER_NAMES[key],
		currentVersion: normalizedVersion,
		currentMajor: latestMajor,
		latestVersion: normalizedVersion,
		latestMajor,
		supportedEsrMajors: normalizedSupportedEsrMajors,
		source: source.source,
		sourceUrl: source.sourceUrl,
		sourceFetchedAt: sourceFetchedAt || null,
		sources: {
			currentVersion: {
				source: source.source,
				sourceUrl: source.sourceUrl,
				fetchedAt: sourceFetchedAt || null
			},
			eol: null
		},
		platforms: BROWSER_PLATFORMS[key],
		notes
	}
}

export function createBrowserVersionsDataset(entries = {}, {
	generatedAt = new Date(),
	policy = DEFAULT_BROWSER_VERSION_POLICY
} = {}) {
	const browsers = {}
	const normalizedPolicy = {
		...DEFAULT_BROWSER_VERSION_POLICY,
		...(policy || {})
	}
	for(const key of Object.keys(BROWSER_NAMES)) {
		const entry = normalizeBrowserEntry(key, entries[key] || {}, normalizedPolicy)
		if(entry) browsers[key] = entry
	}
	return {
		schemaVersion: BROWSER_VERSIONS_SCHEMA_VERSION,
		generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : new Date(generatedAt).toISOString(),
		policy: {
			...normalizedPolicy,
			assessment: {
				...BROWSER_VERSION_ASSESSMENT_POLICY,
				thresholds: normalizedPolicy
			},
			eolSource: null
		},
		browsers
	}
}

export function isBrowserVersionsDatasetStale(dataset, {
	now = new Date(),
	maxAgeMs = BROWSER_VERSION_DATA_MAX_AGE_MS
} = {}) {
	const generatedAtMs = Date.parse(dataset?.generatedAt)
	if(!Number.isFinite(generatedAtMs)) return true
	const nowMs = now instanceof Date ? now.getTime() : Date.parse(now)
	if(!Number.isFinite(nowMs)) return true
	return Math.max(0, nowMs - generatedAtMs) > maxAgeMs
}

export function parseChromeVersionHistory(payload) {
	const versions = Array.isArray(payload?.versions)
		? payload.versions.map(entry => entry?.version || entry?.name)
		: collectObjectVersions(payload)
	return pickLatestVersion(versions)
}

export function parseFirefoxVersions(payload) {
	const latestVersion = normalizeVersion(payload?.LATEST_FIREFOX_VERSION)
		|| pickLatestVersion(collectObjectVersions(payload))
	const esrVersions = [
		payload?.FIREFOX_ESR,
		payload?.LATEST_FIREFOX_ESR_VERSION,
		payload?.FIREFOX_ESR_NEXT
	].filter(Boolean)
	return {
		latestVersion,
		supportedEsrMajors: uniqueMajors(esrVersions)
	}
}

export function parseEdgeProducts(payload) {
	const stableProducts = (Array.isArray(payload) ? payload : [])
		.filter(entry => /stable/i.test(String(entry?.Product || entry?.product || entry?.Name || entry?.name || "")))
	const versions = collectObjectVersions(stableProducts.length ? stableProducts : payload)
	return pickLatestVersion(versions)
}

export function parseSafariReleaseNotes(html) {
	const versions = []
	const text = String(html || "")
	for(const match of text.matchAll(/\bSafari\s+(\d+(?:\.\d+)*)(?!\s*Beta)\b/gi)) {
		versions.push(match[1])
	}
	return pickLatestVersion(versions)
}

export function parseSamsungReleaseNotes(html) {
	const versions = []
	const text = String(html || "")
	for(const match of text.matchAll(/\bSamsung\s+(?:Internet|Browser)(?:\s+for\s+(?:Android|Windows))?\s+(\d+(?:\.\d+)*)\b/gi)) {
		versions.push(match[1])
	}
	return pickLatestVersion(versions)
}

export function parseOperaDesktopIndex(html) {
	const versions = []
	const text = String(html || "")
	for(const match of text.matchAll(/\b(\d+(?:\.\d+){2,})\//g)) {
		versions.push(match[1])
	}
	return pickLatestVersion(versions)
}

async function fetchJson(fetchFn, url) {
	const response = await fetchFn(url, {
		headers: {
			"Accept": "application/json"
		}
	})
	if(!response.ok) throw new Error(`${url} HTTP ${response.status}`)
	return response.json()
}

async function fetchText(fetchFn, url) {
	const response = await fetchFn(url, {
		headers: {
			"Accept": "text/html, text/plain"
		}
	})
	if(!response.ok) throw new Error(`${url} HTTP ${response.status}`)
	return response.text()
}

export async function fetchBrowserVersionsDataset({
	fetchFn = fetch,
	now = new Date(),
	loggerFn = null
} = {}) {
	const sourceFetchedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString()
	const entries = {}

	try {
		const chrome = await fetchJson(fetchFn, BROWSER_VERSION_SOURCES.chrome.sourceUrl)
		entries.chrome = {
			latestVersion: parseChromeVersionHistory(chrome),
			sourceFetchedAt
		}
	} catch(error) {
		if(loggerFn) await loggerFn(`browser-versions chrome: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	}

	try {
		const firefox = await fetchJson(fetchFn, BROWSER_VERSION_SOURCES.firefox.sourceUrl)
		entries.firefox = {
			...parseFirefoxVersions(firefox),
			sourceFetchedAt
		}
	} catch(error) {
		if(loggerFn) await loggerFn(`browser-versions firefox: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	}

	try {
		const edge = await fetchJson(fetchFn, BROWSER_VERSION_SOURCES.edge.sourceUrl)
		entries.edge = {
			latestVersion: parseEdgeProducts(edge),
			sourceFetchedAt
		}
	} catch(error) {
		if(loggerFn) await loggerFn(`browser-versions edge: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	}

	try {
		const safari = await fetchText(fetchFn, BROWSER_VERSION_SOURCES.safari.sourceUrl)
		entries.safari = {
			latestVersion: parseSafariReleaseNotes(safari),
			sourceFetchedAt,
			notes: "Safari detection is best effort because Safari releases are tied to Apple OS releases."
		}
	} catch(error) {
		if(loggerFn) await loggerFn(`browser-versions safari: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	}

	try {
		const [samsungWindows, samsungAndroid] = await Promise.all([
			fetchText(fetchFn, BROWSER_VERSION_SOURCES.samsung.sourceUrl),
			fetchText(fetchFn, "https://developer.samsung.com/internet/release-note/android-release-note.html")
		])
		entries.samsung = {
			latestVersion: pickLatestVersion([
				parseSamsungReleaseNotes(samsungWindows),
				parseSamsungReleaseNotes(samsungAndroid)
			]),
			sourceFetchedAt,
			notes: "Samsung Browser version is sourced from Samsung release notes. API checks assess Samsung Internet user agents by embedded Chromium engine version when present."
		}
	} catch(error) {
		if(loggerFn) await loggerFn(`browser-versions samsung: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	}

	try {
		const opera = await fetchText(fetchFn, BROWSER_VERSION_SOURCES.opera.sourceUrl)
		entries.opera = {
			latestVersion: parseOperaDesktopIndex(opera),
			sourceFetchedAt,
			notes: "Opera desktop version is sourced from Opera's public release directory. API checks assess Opera user agents by embedded Chromium engine version when present."
		}
	} catch(error) {
		if(loggerFn) await loggerFn(`browser-versions opera: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	}

	return createBrowserVersionsDataset(entries, {
		generatedAt: now
	})
}

export async function loadBrowserVersions({
	redisClient = redis,
	key = BROWSER_VERSIONS_KEY
} = {}) {
	const raw = await redisClient.get(key)
	if(!raw) return null
	try {
		return JSON.parse(raw)
	} catch {
		return null
	}
}

export async function saveBrowserVersions(dataset, {
	redisClient = redis,
	key = BROWSER_VERSIONS_KEY
} = {}) {
	await redisClient.set(key, JSON.stringify(dataset))
}
