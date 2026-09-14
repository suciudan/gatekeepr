import { measurePerformance } from "@repo/core/performance"
import {
	BROWSER_VERSION_DATA_MAX_AGE_MS,
	DEFAULT_BROWSER_VERSION_POLICY,
	isBrowserVersionsDatasetStale,
	loadBrowserVersions
} from "@repo/core/browser-versions"

const LEGACY_EDGEHTML_RE = /\bEdge\/(\d+(?:\.\d+)*)/i
const IE_RE = /\bMSIE\s+(\d+(?:\.\d+)*)|Trident\/.*\brv:(\d+(?:\.\d+)*)/i

function parseVersion(value) {
	const match = String(value || "").match(/\d+(?:\.\d+)*/)
	return match ? match[0] : null
}

function parseMajor(value) {
	const version = parseVersion(value)
	if(!version) return null
	const major = Number(version.split(".")[0])
	return Number.isInteger(major) ? major : null
}

function buildParsedBrowser({ key, name, version, legacy = false, productVersion = null, engine = null }) {
	const normalizedVersion = parseVersion(version)
	const major = parseMajor(normalizedVersion)
	if(!legacy && (!normalizedVersion || !Number.isInteger(major))) return null
	return {
		key,
		name,
		version: normalizedVersion,
		major,
		legacy,
		productVersion: parseVersion(productVersion),
		engine
	}
}

export function parseBrowserUserAgent(userAgent) {
	const ua = String(userAgent || "")
	if(!ua) return null

	const ie = ua.match(IE_RE)
	if(ie) {
		return buildParsedBrowser({
			key: "ie",
			name: "Internet Explorer",
			version: ie[1] || ie[2],
			legacy: true
		})
	}

	const edgeHtml = ua.match(LEGACY_EDGEHTML_RE)
	if(edgeHtml) {
		return buildParsedBrowser({
			key: "edgehtml",
			name: "EdgeHTML",
			version: edgeHtml[1],
			legacy: true
		})
	}

	const edge = ua.match(/\bEdg(?:A|iOS)?\/(\d+(?:\.\d+)*)/i)
	if(edge) {
		return buildParsedBrowser({
			key: "edge",
			name: "Edge",
			version: edge[1]
		})
	}

	const samsung = ua.match(/\bSamsungBrowser\/(\d+(?:\.\d+)*)/i)
	if(samsung) {
		const chromium = ua.match(/\b(?:Chrome|Chromium)\/(\d+(?:\.\d+)*)/i)
		return buildParsedBrowser({
			key: "chrome",
			name: "Samsung Internet",
			version: chromium?.[1] || samsung[1],
			productVersion: samsung[1],
			engine: chromium ? "Chromium" : null
		})
	}

	const opera = ua.match(/\b(?:OPR|Opera|OPT)\/(\d+(?:\.\d+)*)/i)
	if(opera) {
		const chromium = ua.match(/\b(?:Chrome|Chromium)\/(\d+(?:\.\d+)*)/i)
		return buildParsedBrowser({
			key: "chrome",
			name: "Opera",
			version: chromium?.[1] || opera[1],
			productVersion: opera[1],
			engine: chromium ? "Chromium" : null
		})
	}

	const yandex = ua.match(/\bYaBrowser\/(\d+(?:\.\d+)*)/i)
	if(yandex) {
		const chromium = ua.match(/\b(?:Chrome|Chromium)\/(\d+(?:\.\d+)*)/i)
		return buildParsedBrowser({
			key: "chrome",
			name: "Yandex Browser",
			version: chromium?.[1] || yandex[1],
			productVersion: yandex[1],
			engine: chromium ? "Chromium" : null
		})
	}

	const uc = ua.match(/\bUCBrowser\/(\d+(?:\.\d+)*)/i)
	if(uc) {
		const chromium = ua.match(/\b(?:Chrome|Chromium)\/(\d+(?:\.\d+)*)/i)
		return buildParsedBrowser({
			key: chromium ? "chrome" : "uc",
			name: "UC Browser",
			version: chromium?.[1] || uc[1],
			productVersion: uc[1],
			engine: chromium ? "Chromium" : null
		})
	}

	const firefox = ua.match(/\b(?:Firefox|FxiOS)\/(\d+(?:\.\d+)*)/i)
	if(firefox) {
		return buildParsedBrowser({
			key: "firefox",
			name: "Firefox",
			version: firefox[1]
		})
	}

	const chrome = ua.match(/\b(?:Chrome|Chromium|CriOS|HeadlessChrome)\/(\d+(?:\.\d+)*)/i)
	if(chrome) {
		return buildParsedBrowser({
			key: "chrome",
			name: ua.includes("Chromium/") ? "Chromium" : "Chrome",
			version: chrome[1]
		})
	}

	if(/\bSafari\//i.test(ua) && !/\b(?:Chrome|Chromium|CriOS|HeadlessChrome|Edg|OPR)\//i.test(ua)) {
		const safari = ua.match(/\bVersion\/(\d+(?:\.\d+)*)/i)
		if(safari) {
			return buildParsedBrowser({
				key: "safari",
				name: "Safari",
				version: safari[1]
			})
		}
	}

	return null
}

export function assessBrowserVersion(parsedBrowser, dataset, {
	now = new Date(),
	maxAgeMs = BROWSER_VERSION_DATA_MAX_AGE_MS
} = {}) {
	if(!parsedBrowser) return null
	if(parsedBrowser.legacy) {
		return {
			threat: "ua_browser_unsupported",
			latest: null,
			lag: null,
			source: null
		}
	}
	if(!dataset || isBrowserVersionsDatasetStale(dataset, { now, maxAgeMs })) return null

	const browser = dataset.browsers?.[parsedBrowser.key]
	if(!browser || !Number.isInteger(browser.latestMajor) || !Number.isInteger(parsedBrowser.major)) return null

	const policy = {
		...DEFAULT_BROWSER_VERSION_POLICY,
		...(dataset.policy || {})
	}
	const lag = browser.latestMajor - parsedBrowser.major

	if(parsedBrowser.key === "firefox" && browser.supportedEsrMajors?.includes(parsedBrowser.major)) {
		return {
			threat: null,
			latest: browser,
			lag,
			source: browser.source
		}
	}

	if(parsedBrowser.major - browser.latestMajor > policy.maxFutureMajorLag) {
		return {
			threat: "ua_browser_version_suspicious",
			latest: browser,
			lag,
			source: browser.source
		}
	}

	if(lag >= policy.unsupportedMajorLag) {
		return {
			threat: "ua_browser_unsupported",
			latest: browser,
			lag,
			source: browser.source
		}
	}

	if(lag >= policy.outdatedMajorLag) {
		return {
			threat: "ua_browser_outdated",
			latest: browser,
			lag,
			source: browser.source
		}
	}

	return {
		threat: null,
		latest: browser,
		lag,
		source: browser.source
	}
}

export const createBrowserVersionCheck = ({
	loadBrowserVersionsFn = loadBrowserVersions,
	nowFactory = () => new Date(),
	maxAgeMs = BROWSER_VERSION_DATA_MAX_AGE_MS
} = {}) => {
	return async function browserVersionCheck(ctx) {
		const { user_agent } = ctx.payload
		if(!user_agent) return

		let start
		if(measurePerformance()) start = performance.now()

		const parsed = parseBrowserUserAgent(user_agent)
		if(!parsed) {
			if(measurePerformance()) ctx.performance.ua_browser_version_unknown = performance.now() - start
			return
		}

		ctx.info.browser_name = parsed.name
		if(parsed.version) ctx.info.browser_version = parsed.version
		if(parsed.productVersion) ctx.info.browser_product_version = parsed.productVersion
		if(parsed.engine) ctx.info.browser_engine = parsed.engine
		if(Number.isInteger(parsed.major)) ctx.info.browser_major = parsed.major

		const dataset = parsed.legacy ? null : await loadBrowserVersionsFn()
		const assessment = assessBrowserVersion(parsed, dataset, {
			now: nowFactory(),
			maxAgeMs
		})

		if(assessment?.latest) {
			ctx.info.browser_latest_major = assessment.latest.latestMajor
			ctx.info.browser_major_lag = assessment.lag
			ctx.info.browser_version_source = assessment.source
		}

		if(assessment?.threat) {
			ctx.threats.push(assessment.threat)
			if(measurePerformance()) ctx.performance[assessment.threat] = performance.now() - start
			return
		}

		if(measurePerformance()) ctx.performance.ua_browser_version_ok = performance.now() - start
	}
}

export const browserVersionCheck = createBrowserVersionCheck()
