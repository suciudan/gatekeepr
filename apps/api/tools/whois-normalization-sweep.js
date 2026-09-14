import fs from "node:fs"

import { getDomainInfo } from "@repo/core/whois"

const IANA_TLD_LIST_URL = "https://data.iana.org/TLD/tlds-alpha-by-domain.txt"
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function normalizePositiveInteger(value, fallback) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeNonNegativeInteger(value, fallback = 0) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
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
	retries,
	delayMs
}) {
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

async function fetchIanaTlds() {
	const response = await fetch(IANA_TLD_LIST_URL)
	if(!response.ok) throw new Error(`IANA TLD list HTTP ${response.status}`)
	return (await response.text())
		.split(/\r?\n/)
		.map(row => row.trim().toLowerCase())
		.filter(row => row && !row.startsWith("#"))
}

function cleanCell(value) {
	return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim()
}

function escapeMarkdownCell(value) {
	return String(value ?? "")
		.replace(/\|/g, "\\|")
		.replace(/\r?\n/g, " ")
}

function assertDomainInfoShape(info) {
	if(info.creation != null && !ISO_TIMESTAMP_PATTERN.test(info.creation)) {
		throw new Error(`creation_not_iso:${info.creation}`)
	}
	if(info.expiration != null && !ISO_TIMESTAMP_PATTERN.test(info.expiration)) {
		throw new Error(`expiration_not_iso:${info.expiration}`)
	}
	if(info.expirationSource != null && !["RDAP", "WHOIS"].includes(info.expirationSource)) {
		throw new Error(`bad_expiration_source:${info.expirationSource}`)
	}
	if(!Array.isArray(info.status)) throw new Error("status_not_array")
	for(const status of info.status) {
		if(status !== String(status).toLowerCase()) throw new Error(`status_not_lowercase:${status}`)
		if(status !== String(status).trim()) throw new Error(`status_not_trimmed:${status}`)
	}
}

function isRdapHttp429Error(value) {
	return /\brdap http 429\b/i.test(String(value ?? ""))
}

function writeMarkdownReport({
	txtPath,
	mdPath,
	rows,
	summary
}) {
	const rdapErrors = rows.filter(row => row.rdapError)
	const rdapRateLimited = rows.filter(row => isRdapHttp429Error(row.rdapError))
	const cleanRdap = rows.filter(row => !row.rdapError)
	const cleanRdapWithExpiration = cleanRdap.filter(row => row.expiration)
	const whoisFallbackWithExpiration = rows.filter(row => row.rdapError && row.expirationSource === "WHOIS")
	const errors = rows.filter(row => row.result === "error")
	const noExpiration = rows.filter(row => !row.expiration)
	const withoutSignals = rows.filter(row => !row.creation && !row.expiration && Number(row.statusCount || 0) === 0)
	const expirationSourceCounts = rows.reduce((acc, row) => {
		const key = row.expirationSource || "none"
		acc[key] = (acc[key] || 0) + 1
		return acc
	}, {})

	function table(columns, data) {
		return [
			`| ${columns.join(" | ")} |`,
			`| ${columns.map(() => "---").join(" | ")} |`,
			...data.map(row => `| ${columns.map(column => escapeMarkdownCell(row[column])).join(" | ")} |`)
		].join("\n")
	}

	const columns = ["tld", "domain", "result", "creation", "expiration", "expirationSource", "statusCount", "rdapError", "error"]
	const summaryRows = [
		{ Metric: "IANA TLDs available", Value: summary.totalTlds },
		{ Metric: "IANA TLDs tested", Value: summary.testedTlds },
		{ Metric: "TLD offset", Value: summary.offset },
		{ Metric: "TLD limit", Value: summary.limit || "none" },
		{ Metric: "Candidate format", Value: summary.candidate },
		{ Metric: "Concurrency", Value: summary.concurrency },
		{ Metric: "Per-worker delay", Value: `${summary.delayMs}ms` },
		{ Metric: "RDAP 429 retries", Value: summary.rdap429Retries },
		{ Metric: "RDAP 429 retry base delay", Value: `${summary.rdap429RetryDelayMs}ms` },
		{ Metric: "Rows with normalized shape", Value: summary.ok },
		{ Metric: "Script/runtime errors", Value: summary.error },
		{ Metric: "Normalization failures", Value: summary.normalizedFailures },
		{ Metric: "Clean RDAP rows", Value: cleanRdap.length },
		{ Metric: "Rows with RDAP errors", Value: rdapErrors.length },
		{ Metric: "Rows with RDAP HTTP 429", Value: rdapRateLimited.length },
		{ Metric: "Clean RDAP rows with expiration", Value: cleanRdapWithExpiration.length },
		{ Metric: "WHOIS fallback rows with expiration", Value: whoisFallbackWithExpiration.length },
		{ Metric: "Rows with creation date", Value: summary.withCreation },
		{ Metric: "Rows with expiration date", Value: summary.withExpiration },
		{ Metric: "Rows with status entries", Value: summary.withStatus },
		{ Metric: "Rows without creation, expiration, or status", Value: withoutSignals.length },
		{ Metric: "Started at", Value: summary.startedAt },
		{ Metric: "Finished at", Value: summary.finishedAt },
		{ Metric: "Elapsed", Value: summary.elapsedMs ? `${(summary.elapsedMs / 1000).toFixed(1)}s` : "" },
		{ Metric: "Source", Value: summary.source }
	]
	const expirationSourceRows = Object.entries(expirationSourceCounts)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([Source, Count]) => ({ Source, Count }))
	const content = [
		"# Gatekeepr WHOIS/RDAP Normalization Sweep",
		"",
		`Generated from \`${txtPath}\`.`,
		"",
		"> Rows with `rdapError` are fallback/partial rows. The sweep retries RDAP HTTP 429 responses; any remaining 429 row should be treated as a failed clean RDAP lookup.",
		"",
		"## Summary",
		"",
		table(["Metric", "Value"], summaryRows),
		"",
		"## Expiration Source Counts",
		"",
		table(["Source", "Count"], expirationSourceRows),
		"",
		"## RDAP Error Rows",
		"",
		`Count: ${rdapErrors.length}`,
		"",
		table(columns, rdapErrors.slice(0, 200)),
		rdapErrors.length > 200 ? `\nShowing first 200 of ${rdapErrors.length} RDAP error rows.` : "",
		"",
		"## RDAP HTTP 429 Rows",
		"",
		`Count: ${rdapRateLimited.length}`,
		"",
		table(columns, rdapRateLimited.slice(0, 200)),
		rdapRateLimited.length > 200 ? `\nShowing first 200 of ${rdapRateLimited.length} RDAP HTTP 429 rows.` : "",
		"",
		"## Error Rows",
		"",
		errors.length ? table(columns, errors) : "No script/runtime error rows.",
		"",
		"## Rows Without Expiration",
		"",
		`Count: ${noExpiration.length}`,
		"",
		table(columns, noExpiration.slice(0, 200)),
		noExpiration.length > 200 ? `\nShowing first 200 of ${noExpiration.length} rows without expiration.` : "",
		"",
		"## Full Results",
		"",
		table(columns, rows)
	].join("\n")

	fs.writeFileSync(mdPath, `${content}\n`, "utf8")
}

function writeTextReport(txtPath, rows, summary) {
	const columns = ["tld", "domain", "result", "creation", "expiration", "expirationSource", "statusCount", "rdapError", "error"]
	const lines = [
		"# Gatekeepr WHOIS/RDAP normalization sweep",
		`# ${JSON.stringify(summary)}`,
		columns.join("\t"),
		...rows.map(row => columns.map(column => cleanCell(row[column])).join("\t")),
		`# ${JSON.stringify(summary)}`
	]
	fs.writeFileSync(txtPath, `${lines.join("\n")}\n`, "utf8")
}

function readSweepRows(txtPath) {
	const lines = fs.readFileSync(txtPath, "utf8").split(/\r?\n/)
	const summary = lines
		.filter(line => line.startsWith("# {"))
		.map(line => {
			try {
				return JSON.parse(line.slice(2))
			} catch {
				return null
			}
		})
		.filter(Boolean)
		.at(-1) || {}
	const headerIndex = lines.findIndex(line => line.startsWith("tld\t"))
	if(headerIndex === -1) throw new Error(`Missing TSV header in ${txtPath}`)
	const columns = lines[headerIndex].split("\t")
	const rows = lines
		.slice(headerIndex + 1)
		.filter(line => line && !line.startsWith("#"))
		.map(line => {
			const values = line.split("\t")
			return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]))
		})
	return { rows, summary }
}

function updateSummaryFromRows(summary, rows) {
	summary.testedTlds = rows.length
	summary.ok = rows.filter(row => row.result === "ok").length
	summary.error = rows.filter(row => row.result === "error").length
	summary.withCreation = rows.filter(row => row.creation).length
	summary.withExpiration = rows.filter(row => row.expiration).length
	summary.withStatus = rows.filter(row => Number(row.statusCount || 0) > 0).length
	summary.normalizedFailures = rows.filter(row => /_not_|bad_expiration_source/.test(row.error)).length
	summary.rdapErrors = rows.filter(row => row.rdapError).length
	summary.rdapHttp429 = rows.filter(row => isRdapHttp429Error(row.rdapError)).length
	return summary
}

async function main() {
	const txtPath = process.env.DNS_RESULTS_TXT || "dns-results.txt"
	const mdPath = process.env.DNS_RESULTS_MD || "dns-results.md"
	const concurrency = normalizePositiveInteger(process.env.LIVE_WHOIS_TLD_CONCURRENCY, 1)
	const delayMs = normalizeNonNegativeInteger(process.env.LIVE_WHOIS_TLD_DELAY_MS, 1000)
	const offset = normalizeNonNegativeInteger(process.env.LIVE_WHOIS_TLD_OFFSET, 0)
	const limit = normalizeNonNegativeInteger(process.env.LIVE_WHOIS_TLD_LIMIT, 0)
	const rdap429Retries = normalizeNonNegativeInteger(process.env.LIVE_WHOIS_RDAP_429_RETRIES, 8)
	const rdap429RetryDelayMs = normalizePositiveInteger(process.env.LIVE_WHOIS_RDAP_429_RETRY_DELAY_MS, 10000)
	if(process.env.DNS_RESULTS_RENDER_ONLY === "1") {
		const { rows, summary } = readSweepRows(txtPath)
		updateSummaryFromRows(summary, rows)
		writeTextReport(txtPath, rows, summary)
		writeMarkdownReport({ txtPath, mdPath, rows, summary })
		console.log(JSON.stringify(summary, null, 2))
		if(summary.rdapHttp429 > 0 && process.env.LIVE_WHOIS_ALLOW_RDAP_429 !== "1") {
			throw new Error(`RDAP HTTP 429 rows remained after retries: ${summary.rdapHttp429}`)
		}
		return
	}
	const allTlds = await fetchIanaTlds()
	const tlds = limit > 0
		? allTlds.slice(offset, offset + limit)
		: allTlds.slice(offset)
	const startedAt = new Date()
	const summary = {
		startedAt: startedAt.toISOString(),
		source: IANA_TLD_LIST_URL,
		totalTlds: allTlds.length,
		testedTlds: tlds.length,
		offset,
		limit,
		candidate: "nic.<tld>",
		concurrency,
		delayMs,
		rdap429Retries,
		rdap429RetryDelayMs,
		ok: 0,
		error: 0,
		withCreation: 0,
		withExpiration: 0,
		withStatus: 0,
		normalizedFailures: 0
	}
	const fetchFn = createRetryingFetch({
		retries: rdap429Retries,
		delayMs: rdap429RetryDelayMs
	})
	const stream = fs.createWriteStream(txtPath, { encoding: "utf8" })
	const rows = []
	let next = 0
	let startSlot = 0

	stream.write("# Gatekeepr WHOIS/RDAP normalization sweep\n")
	stream.write(`# ${JSON.stringify(summary)}\n`)
	stream.write("tld\tdomain\tresult\tcreation\texpiration\texpirationSource\tstatusCount\trdapError\terror\n")

	async function worker() {
		while(next < tlds.length) {
			const index = next
			next += 1
			const tld = tlds[index]
			const domain = `nic.${tld}`
			const slot = startSlot
			startSlot += 1
			if(delayMs > 0) {
				const targetStartAt = startedAt.getTime() + (slot * delayMs)
				const waitMs = targetStartAt - Date.now()
				if(waitMs > 0) await sleep(waitMs)
			}
			try {
				const info = await getDomainInfo(domain, {
					includeDns: false,
					fetchFn,
					rdapTimeoutMs: 10000,
					whoisTimeoutMs: 12000
				})
				assertDomainInfoShape(info)
				const row = {
					tld,
					domain,
					result: "ok",
					creation: cleanCell(info.creation),
					expiration: cleanCell(info.expiration),
					expirationSource: cleanCell(info.expirationSource),
					statusCount: String(info.status.length),
					rdapError: cleanCell(info.rdapError),
					error: ""
				}
				rows.push(row)
				summary.ok += 1
				if(info.creation) summary.withCreation += 1
				if(info.expiration) summary.withExpiration += 1
				if(info.status.length) summary.withStatus += 1
				stream.write(Object.values(row).join("\t") + "\n")
			} catch(error) {
				const message = error?.message || String(error)
				if(message.includes("_not_") || message.includes("bad_expiration_source")) {
					summary.normalizedFailures += 1
				}
				const row = {
					tld,
					domain,
					result: "error",
					creation: "",
					expiration: "",
					expirationSource: "",
					statusCount: "",
					rdapError: "",
					error: cleanCell(message)
				}
				rows.push(row)
				summary.error += 1
				stream.write(Object.values(row).join("\t") + "\n")
			}
			if((index + 1) % 25 === 0) {
				console.log(`processed ${index + 1} / ${tlds.length} ok ${summary.ok} error ${summary.error}`)
			}
		}
	}

	await Promise.all(Array.from({
		length: Math.min(concurrency, tlds.length)
	}, () => worker()))

	summary.finishedAt = new Date().toISOString()
	summary.elapsedMs = Date.parse(summary.finishedAt) - Date.parse(summary.startedAt)
	rows.sort((left, right) => tlds.indexOf(left.tld) - tlds.indexOf(right.tld))
	updateSummaryFromRows(summary, rows)
	stream.write(`# ${JSON.stringify(summary)}\n`)
	await new Promise(resolve => stream.end(resolve))
	writeMarkdownReport({
		txtPath,
		mdPath,
		rows,
		summary
	})
	console.log(JSON.stringify(summary, null, 2))
	if(summary.rdapHttp429 > 0 && process.env.LIVE_WHOIS_ALLOW_RDAP_429 !== "1") {
		throw new Error(`RDAP HTTP 429 rows remained after retries: ${summary.rdapHttp429}`)
	}
}

try {
	await main()
	process.exit(0)
} catch(error) {
	console.error(error?.stack || error?.message || String(error))
	process.exit(1)
}
