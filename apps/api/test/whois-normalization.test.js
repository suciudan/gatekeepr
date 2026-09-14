import assert from "node:assert"

import { __testables, getDomainInfo } from "@repo/core/whois"

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const IANA_TLD_LIST_URL = "https://data.iana.org/TLD/tlds-alpha-by-domain.txt"
const LIVE_TLD_SWEEP_CONCURRENCY = 2
const LIVE_TLD_SWEEP_DELAY_MS = 250
const LIVE_RDAP_429_RETRIES = 6
const LIVE_RDAP_429_RETRY_DELAY_MS = 5000

const whoisFixtureDomains = [
	{
		domain: "example.com",
		whois: [
			"Domain Name: EXAMPLE.COM",
			"Creation Date: 1995-08-14T04:00:00Z",
			"Registry Expiry Date: 2027-08-13T04:00:00Z",
			"Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited"
		].join("\n"),
		expected: {
			creation: "1995-08-14T04:00:00.000Z",
			expiration: "2027-08-13T04:00:00.000Z",
			status: ["clienttransferprohibited"]
		}
	},
	{
		domain: "example.ro",
		whois: [
			"Domain Name: example.ro",
			"Registered On: Before 2001",
			"Registrar: ICI - Registrar",
			"Domain Status: OK until 2029-05-29"
		].join("\n"),
		expected: {
			creation: null,
			expiration: "2029-05-29T00:00:00.000Z",
			status: ["ok"]
		}
	},
	{
		domain: "example.co.uk",
		whois: [
			"Domain name:",
			"    example.co.uk",
			"Registered on: 01-Jan-2020",
			"Expiry date: 01-Jan-2027",
			"Registration status:",
			"    Registered until expiry date."
		].join("\n"),
		expected: {
			creation: "2020-01-01T00:00:00.000Z",
			expiration: "2027-01-01T00:00:00.000Z",
			status: []
		}
	},
	{
		domain: "example.pl",
		whois: [
			"DOMAIN NAME: example.pl",
			"created: 2021.09.24 12:30:45",
			"renewal date: 2027.11.05 00:00:00"
		].join("\n"),
		expected: {
			creation: "2021-09-24T12:30:45.000Z",
			expiration: "2027-11-05T00:00:00.000Z",
			status: []
		}
	},
	{
		domain: "example.test",
		whois: [
			"domain: example.test",
			"created: 24 Sep 2021",
			"paid-till: 05 Nov 2027"
		].join("\n"),
		expected: {
			creation: "2021-09-24T00:00:00.000Z",
			expiration: "2027-11-05T00:00:00.000Z",
			status: []
		}
	}
]

const rdapFixtureDomains = [
	{
		domain: "example.dev",
		rdap: {
			events: [
				{ eventAction: "registration", eventDate: "2021-09-24T12:30:45Z" },
				{ eventAction: "last update of RDAP database", eventDate: "2025-01-01T00:00:00Z" },
				{ eventAction: "expiration", eventDate: "2027-11-05T00:00:00Z" }
			],
			status: ["active", "client transfer prohibited"]
		},
		expected: {
			creation: "2021-09-24T12:30:45.000Z",
			expiration: "2027-11-05T00:00:00.000Z",
			status: ["active", "client transfer prohibited"]
		}
	}
]

const liveDomainSamples = [
	"example.com",
	"google.ro",
	"rotld.ro",
	"bbc.co.uk",
	"registro.br"
]

function normalizePositiveInteger(value, fallback) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeNonNegativeInteger(value, fallback = 0) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

async function mapWithConcurrency(values, concurrency, mapper) {
	const results = new Array(values.length)
	let nextIndex = 0
	async function worker() {
		while(nextIndex < values.length) {
			const index = nextIndex++
			results[index] = await mapper(values[index], index)
		}
	}
	await Promise.all(Array.from({
		length: Math.min(concurrency, values.length)
	}, () => worker()))
	return results
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function readRetryAfterMs(response) {
	const value = response?.headers?.get?.("retry-after")
	if(!value) return null
	const seconds = Number(value)
	if(Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
	const dateMs = Date.parse(value)
	return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null
}

function createRetryingFetch({
	fetchImpl = fetch,
	retries = LIVE_RDAP_429_RETRIES,
	delayMs = LIVE_RDAP_429_RETRY_DELAY_MS
} = {}) {
	return async function retryingFetch(url, options) {
		let response = null
		for(let attempt = 0; attempt <= retries; attempt += 1) {
			response = await fetchImpl(url, options)
			if(response.status !== 429 || attempt === retries) return response
			await sleep(readRetryAfterMs(response) ?? (delayMs * (attempt + 1)))
		}
		return response
	}
}

async function fetchIanaTlds(fetchImpl = fetch) {
	const response = await fetchImpl(IANA_TLD_LIST_URL)
	if(!response.ok) throw new Error(`IANA TLD list HTTP ${response.status}`)
	return (await response.text())
		.split(/\r?\n/)
		.map(row => row.trim().toLowerCase())
		.filter(row => row && !row.startsWith("#"))
}

function assertIsoTimestampOrNull(value, label) {
	if(value == null) return
	assert.equal(typeof value, "string", `${label} must be a string or null`)
	assert.match(value, ISO_TIMESTAMP_PATTERN, `${label} must be normalized ISO-8601 UTC`)
	assert.ok(Number.isFinite(Date.parse(value)), `${label} must be parseable`)
}

function assertDomainInfoShape(info) {
	assert.equal(typeof info.domain, "string")
	assertIsoTimestampOrNull(info.creation, `${info.domain} creation`)
	assertIsoTimestampOrNull(info.expiration, `${info.domain} expiration`)
	assert.ok(info.expirationSource === null || ["RDAP", "WHOIS"].includes(info.expirationSource))
	assert.ok(Array.isArray(info.status), `${info.domain} status must be an array`)
	for(const status of info.status) {
		assert.equal(status, status.toLowerCase(), `${info.domain} status must be lowercase`)
		assert.equal(status.trim(), status, `${info.domain} status must be trimmed`)
	}
}

function isRdapHttp429Error(value) {
	return /\brdap http 429\b/i.test(String(value ?? ""))
}

function createRdapFetch(domain, rdap) {
	return async (url) => {
		const href = String(url)
		if(href.includes("data.iana.org/rdap/dns.json")) {
			return {
				ok: true,
				status: 200,
				json: async () => ({
					services: [
						[[domain.split(".").at(-1)], ["https://rdap.example.test"]]
					]
				})
			}
		}
		if(href.includes(`/domain/${encodeURIComponent(domain)}`)) {
			return {
				ok: true,
				status: 200,
				json: async () => rdap
			}
		}
		throw new Error(`Unexpected RDAP URL ${href}`)
	}
}

function createNoRdapFetch() {
	return async (url) => {
		const href = String(url)
		if(href.includes("data.iana.org/rdap/dns.json")) {
			return {
				ok: true,
				status: 200,
				json: async () => ({ services: [] })
			}
		}
		throw new Error(`Unexpected RDAP URL ${href}`)
	}
}

describe("WHOIS and RDAP normalization", function () {
	for(const sample of whoisFixtureDomains) {
		it(`normalizes WHOIS fields for ${sample.domain}`, async function () {
			const info = await getDomainInfo(sample.domain, {
				includeDns: false,
				fetchFn: createNoRdapFetch(),
				whoisLookup: async () => sample.whois
			})

			assertDomainInfoShape(info)
			assert.equal(info.creation, sample.expected.creation)
			assert.equal(info.expiration, sample.expected.expiration)
			assert.equal(info.expirationSource, sample.expected.expiration ? "WHOIS" : null)
			assert.deepEqual(info.status, sample.expected.status)
		})
	}

	for(const sample of rdapFixtureDomains) {
		it(`normalizes RDAP events for ${sample.domain}`, async function () {
			const info = await getDomainInfo(sample.domain, {
				includeDns: false,
				fetchFn: createRdapFetch(sample.domain, sample.rdap),
				whoisLookup: async () => ""
			})

			assertDomainInfoShape(info)
			assert.equal(info.creation, sample.expected.creation)
			assert.equal(info.expiration, sample.expected.expiration)
			assert.equal(info.expirationSource, "RDAP")
			assert.deepEqual(info.status, sample.expected.status)
		})
	}

	it("extracts expiration from .ro-style status text when no expiration field is present", function () {
		assert.equal(
			__testables.parseWhoisExpiration("Domain Status: OK until 2029-05-29"),
			"2029-05-29T00:00:00.000Z"
		)
		assert.equal(
			__testables.parseWhoisExpiration("Domain Status: RenewPeriod through 05 Nov 2027"),
			"2027-11-05T00:00:00.000Z"
		)
	})

	it("prefers explicit WHOIS expiration fields over dates embedded in status text", function () {
		const whois = [
			"Expires On: 2028-06-01",
			"Domain Status: OK until 2029-05-29"
		].join("\n")
		assert.equal(__testables.parseWhoisExpiration(whois), "2028-06-01T00:00:00.000Z")
	})

	it("does not treat status documentation URLs as expiration dates", function () {
		const whois = "Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited"
		assert.equal(__testables.parseWhoisExpiration(whois), null)
	})

	it("extracts normalized date candidates from mixed status text", function () {
		assert.equal(
			__testables.findNormalizedDateInText("OK until 2027/11/05 (paid)"),
			"2027-11-05T00:00:00.000Z"
		)
	})

	const liveTest = process.env.LIVE_WHOIS_TESTS === "1" ? it : it.skip
	liveTest("normalizes live WHOIS/RDAP responses for representative registered domains", async function () {
		this.timeout(60000)
		for(const domain of liveDomainSamples) {
			const info = await getDomainInfo(domain, {
				includeDns: false,
				rdapTimeoutMs: 10000,
				whoisTimeoutMs: 12000
			})
			assertDomainInfoShape(info)
			assert.ok(
				info.creation || info.expiration || info.status.length > 0,
				`${domain} should return at least one registration signal`
			)
		}
	})

	const liveTldSweepTest = process.env.LIVE_WHOIS_TLD_SWEEP === "1" ? it : it.skip
	liveTldSweepTest("normalizes live WHOIS/RDAP responses across IANA TLD nic domains", async function () {
		this.timeout(10 * 60 * 1000)
		const allTlds = await fetchIanaTlds()
		const offset = normalizeNonNegativeInteger(process.env.LIVE_WHOIS_TLD_OFFSET, 0)
		const limit = normalizeNonNegativeInteger(process.env.LIVE_WHOIS_TLD_LIMIT, 0)
		const tlds = limit > 0
			? allTlds.slice(offset, offset + limit)
			: allTlds.slice(offset)
		const concurrency = normalizePositiveInteger(
			process.env.LIVE_WHOIS_TLD_CONCURRENCY,
			LIVE_TLD_SWEEP_CONCURRENCY
		)
		const delayMs = normalizeNonNegativeInteger(
			process.env.LIVE_WHOIS_TLD_DELAY_MS,
			LIVE_TLD_SWEEP_DELAY_MS
		)
		const allowRdapErrors = process.env.LIVE_WHOIS_ALLOW_RDAP_ERRORS === "1"
		const allowRdap429 = process.env.LIVE_WHOIS_ALLOW_RDAP_429 === "1"
		const fetchFn = createRetryingFetch({
			retries: normalizeNonNegativeInteger(process.env.LIVE_WHOIS_RDAP_429_RETRIES, LIVE_RDAP_429_RETRIES),
			delayMs: normalizePositiveInteger(process.env.LIVE_WHOIS_RDAP_429_RETRY_DELAY_MS, LIVE_RDAP_429_RETRY_DELAY_MS)
		})
		const failures = []
		let signalCount = 0
		let rdapErrorCount = 0

		await mapWithConcurrency(tlds, concurrency, async (tld) => {
			if(delayMs > 0) await sleep(delayMs)
			const domain = `nic.${tld}`
			try {
				const info = await getDomainInfo(domain, {
					includeDns: false,
					fetchFn,
					rdapTimeoutMs: 10000,
					whoisTimeoutMs: 12000
				})
				assertDomainInfoShape(info)
				if(info.creation || info.expiration || info.status.length > 0) {
					signalCount += 1
				}
				if(info.rdapError) {
					rdapErrorCount += 1
					if(!allowRdapErrors && isRdapHttp429Error(info.rdapError) && !allowRdap429) {
						failures.push(`${domain}: RDAP error: ${info.rdapError}`)
					}
				}
			} catch(error) {
				failures.push(`${domain}: ${error.message}`)
			}
		})

		console.log(`IANA TLD WHOIS/RDAP sweep: ${tlds.length}/${allTlds.length} TLDs attempted, ${signalCount} returned registration signals, ${rdapErrorCount} RDAP errors.`)
		assert.deepEqual(failures, [])
		assert.ok(signalCount > 0, "TLD sweep should return at least one registration signal")
	})
})
