import fs from "node:fs"
import path from "node:path"

import { getDomainInfo } from "@repo/core/whois"

const rootDir = path.resolve(import.meta.dirname, "..", "..")
const inputPath = path.join(rootDir, "source", "domains.json")
const outputPath = path.join(rootDir, "source", "domains.csv")
const concurrency = Math.max(1, Number(process.env.DOMAIN_CONCURRENCY || 2))
const delayMs = Math.max(0, Number(process.env.DOMAIN_DELAY_MS || 250))
const limit = Number(process.env.DOMAIN_LIMIT || 0)

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function toCsvCell(value) {
	const stringValue = value == null ? "" : String(value)
	return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, "\"\"")}"` : stringValue
}

function serializeMxRecords(records) {
	return Array.isArray(records) && records.length ? JSON.stringify(records) : ""
}

async function fetchDomainRow(domain) {
	try {
		const info = await getDomainInfo(domain, {
			includeDns: false,
			includeMx: true,
			includeOwner: true
		})
		return [
			domain,
			(info.status || []).join("|"),
			info.creation || "",
			info.expiration || "",
			info.owner || "",
			serializeMxRecords(info.mxRecords)
		]
	} catch(error) {
		return [domain, `error:${error.message}`, "", "", "", ""]
	}
}

const domains = JSON.parse(fs.readFileSync(inputPath, "utf8"))
const selectedDomains = limit > 0 ? domains.slice(0, limit) : domains
const output = fs.createWriteStream(outputPath, { encoding: "utf8" })

output.write("domain,status,creation_date,expiration_date,owner,mx_records\n")

for(let index = 0; index < selectedDomains.length; index += concurrency) {
	const batch = selectedDomains.slice(index, index + concurrency)
	const rows = await Promise.all(batch.map(fetchDomainRow))
	for(const row of rows) {
		output.write(`${row.map(toCsvCell).join(",")}\n`)
	}
	if(index + concurrency < selectedDomains.length && delayMs > 0) {
		await sleep(delayMs)
	}
	if((index + batch.length) % 50 === 0 || index + batch.length === selectedDomains.length) {
		console.log(`processed ${index + batch.length}/${selectedDomains.length}`)
	}
}

await new Promise((resolve, reject) => {
	output.on("finish", resolve)
	output.on("error", reject)
	output.end()
})
