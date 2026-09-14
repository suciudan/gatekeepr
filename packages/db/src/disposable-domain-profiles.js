import knex from "./knex.js"

export const DISPOSABLE_DOMAIN_PROFILE_TABLE = "disposable_domain_profile"
const PROFILE_CHUNK_SIZE = 250
const REQUIRED_DISPOSABLE_DOMAIN_PROFILE_COLUMNS = ["source"]
let disposableProfileSchemaCheckPromise = null

function chunkValues(values, size = PROFILE_CHUNK_SIZE) {
	const chunks = []
	for(let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size))
	}
	return chunks
}

function sortDomains(domains) {
	return [...new Set((Array.isArray(domains) ? domains : [])
		.map(value => typeof value === "string" ? value.trim().toLowerCase() : "")
		.filter(Boolean))]
		.sort((left, right) => left.localeCompare(right))
}

function serializeJson(value, fallback) {
	return JSON.stringify(Array.isArray(value) ? value : fallback)
}

function parseJsonArray(value) {
	if(!value) return []
	try {
		return Array.isArray(value) ? value : JSON.parse(value)
	} catch {
		return []
	}
}

export function toDisposableDomainProfileRow(profile) {
	if(!profile?.domain) {
		throw new Error("Disposable profile row serialization requires a domain.")
	}

	return {
		domain: profile.domain,
		source: profile.source || "source",
		isDisposable: profile.isDisposable !== false,
		firstSeenAt: profile.firstSeenAt || null,
		lastSeenAt: profile.lastSeenAt || null,
		removedAt: profile.removedAt || null,
		lastEnrichedAt: profile.lastEnrichedAt || null,
		lastEnrichmentError: profile.lastEnrichmentError || null,
		nextEnrichmentAt: profile.nextEnrichmentAt || null,
		creation: profile.creation || null,
		expiration: profile.expiration || null,
		owner: profile.owner || null,
		statusJson: serializeJson(profile.status, []),
		mxRecordsJson: serializeJson(profile.mxRecords, []),
		nextMxRefreshAt: profile.nextMxRefreshAt || null,
		mxResolvedAt: profile.mxResolvedAt || null,
		mxResolvedRecordsJson: serializeJson(profile.mxResolvedRecords, [])
	}
}

export function fromDisposableDomainProfileRow(row) {
	if(!row?.domain) return null

	return {
		domain: row.domain,
		source: row.source || "source",
		isDisposable: row.isDisposable === 1 || row.isDisposable === true || row.isDisposable === "1",
		firstSeenAt: row.firstSeenAt || null,
		lastSeenAt: row.lastSeenAt || null,
		removedAt: row.removedAt || null,
		lastEnrichedAt: row.lastEnrichedAt || null,
		lastEnrichmentError: row.lastEnrichmentError || null,
		nextEnrichmentAt: row.nextEnrichmentAt || null,
		creation: row.creation || null,
		expiration: row.expiration || null,
		owner: row.owner || null,
		status: parseJsonArray(row.statusJson),
		mxRecords: parseJsonArray(row.mxRecordsJson),
		nextMxRefreshAt: row.nextMxRefreshAt || null,
		mxResolvedAt: row.mxResolvedAt || null,
		mxResolvedRecords: parseJsonArray(row.mxResolvedRecordsJson)
	}
}

async function checkDisposableDomainProfileSchema(db) {
	const hasTable = await db.schema.hasTable(DISPOSABLE_DOMAIN_PROFILE_TABLE)
	if(!hasTable) {
		throw new Error(
			`Disposable domain profile table is missing. Run database migrations before refreshing disposable infrastructure: yarn workspace @repo/db migrate:latest`
		)
	}

	const missingColumns = []
	for(const column of REQUIRED_DISPOSABLE_DOMAIN_PROFILE_COLUMNS) {
		if(!await db.schema.hasColumn(DISPOSABLE_DOMAIN_PROFILE_TABLE, column)) {
			missingColumns.push(column)
		}
	}

	if(missingColumns.length > 0) {
		throw new Error(
			`Disposable domain profile schema is outdated; missing columns: ${missingColumns.join(", ")}. Run database migrations before refreshing disposable infrastructure: yarn workspace @repo/db migrate:latest`
		)
	}
}

export async function assertDisposableDomainProfileSchema({
	db = knex,
	force = false
} = {}) {
	if(force || !disposableProfileSchemaCheckPromise) {
		disposableProfileSchemaCheckPromise = checkDisposableDomainProfileSchema(db)
	}

	try {
		await disposableProfileSchemaCheckPromise
	} catch(error) {
		disposableProfileSchemaCheckPromise = null
		throw error
	}
}

export async function listActiveDisposableDomains({
	db = knex,
	source = null
} = {}) {
	let query = db(DISPOSABLE_DOMAIN_PROFILE_TABLE)
		.select("domain")
		.where({ isDisposable: 1 })
		.orderBy("domain", "asc")

	if(source) {
		query = query.andWhere("source", source)
	}

	const rows = await query
	return rows.map(row => row.domain)
}

export async function loadDisposableProfilesFromDb(domains, {
	db = knex
} = {}) {
	const normalizedDomains = sortDomains(domains)
	const profiles = new Map()
	if(normalizedDomains.length === 0) return profiles

	for(const chunk of chunkValues(normalizedDomains, 500)) {
		const rows = await db(DISPOSABLE_DOMAIN_PROFILE_TABLE)
			.select("*")
			.whereIn("domain", chunk)
		for(const row of rows) {
			const profile = fromDisposableDomainProfileRow(row)
			if(profile) profiles.set(profile.domain, profile)
		}
	}

	return profiles
}

async function listDueDisposableDomains(columnName, {
	db = knex,
	now = new Date(),
	limit = 0
} = {}) {
	let query = db(DISPOSABLE_DOMAIN_PROFILE_TABLE)
		.select("domain")
		.where({ isDisposable: 1 })
		.whereNotNull(columnName)
		.andWhere(columnName, "<=", now instanceof Date ? now.toISOString() : now)
		.orderBy(columnName, "asc")
		.orderBy("domain", "asc")

	if(limit > 0) {
		query = query.limit(limit)
	}

	const rows = await query
	return rows.map(row => row.domain)
}

export function getDueDisposableDomainsFromDb(options = {}) {
	return listDueDisposableDomains("nextEnrichmentAt", options)
}

export function getDueDisposableMxRefreshDomainsFromDb(options = {}) {
	return listDueDisposableDomains("nextMxRefreshAt", options)
}

export async function upsertDisposableProfilesToDb(profiles, {
	db = knex
} = {}) {
	const profileList = Array.isArray(profiles) ? profiles.filter(profile => profile?.domain) : []
	if(profileList.length === 0) return

	await assertDisposableDomainProfileSchema({ db })

	for(const chunk of chunkValues(profileList)) {
		const rows = chunk.map(profile => ({
			...toDisposableDomainProfileRow(profile),
			updatedAt: db.fn.now(3)
		}))
		await db(DISPOSABLE_DOMAIN_PROFILE_TABLE)
			.insert(rows)
			.onConflict("domain")
			.merge()
	}
}
