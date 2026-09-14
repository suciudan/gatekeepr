import fs from "node:fs/promises"
import path from "node:path"

function getShardLabel({
	shardCount = 1,
	shardIndex = 0
} = {}) {
	if(shardCount <= 1) return "all"
	return `shard-${shardIndex + 1}-of-${shardCount}`
}

export function getDisposableBackfillStateDir() {
	if(process.env.DISPOSABLE_BACKFILL_STATE_DIR) {
		return path.resolve(process.env.DISPOSABLE_BACKFILL_STATE_DIR)
	}
	return path.resolve(import.meta.dirname, "..", "..", "..", "source", "disposable-backfill")
}

export function getDisposableBackfillStatePath(options = {}) {
	return path.join(getDisposableBackfillStateDir(), `${getShardLabel(options)}.state.json`)
}

export function getDisposableBackfillBatchesDir(options = {}) {
	return path.join(getDisposableBackfillStateDir(), getShardLabel(options))
}

async function writeJsonFile(filePath, value) {
	await fs.mkdir(path.dirname(filePath), { recursive: true })
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export async function loadDisposableBackfillState(options = {}) {
	try {
		return JSON.parse(await fs.readFile(getDisposableBackfillStatePath(options), "utf8"))
	} catch {
		return null
	}
}

export async function saveDisposableBackfillState(state, options = {}) {
	const nextState = {
		...state,
		updatedAt: new Date().toISOString()
	}
	await writeJsonFile(getDisposableBackfillStatePath(options), nextState)
	return nextState
}

export async function saveDisposableBackfillBatchProfiles(profiles, {
	batchNumber,
	...options
} = {}) {
	if(!Array.isArray(profiles) || profiles.length === 0) return null
	if(!Number.isInteger(batchNumber) || batchNumber <= 0) {
		throw new Error("Batch number is required to persist disposable backfill profiles.")
	}

	const batchesDir = getDisposableBackfillBatchesDir(options)
	const batchFileName = `batch-${String(batchNumber).padStart(6, "0")}.json`
	const batchPath = path.join(batchesDir, batchFileName)
	await writeJsonFile(batchPath, profiles)
	return batchPath
}

export async function loadDisposableBackfillBatchProfiles(options = {}) {
	try {
		const batchesDir = getDisposableBackfillBatchesDir(options)
		const fileNames = (await fs.readdir(batchesDir))
			.filter(fileName => fileName.endsWith(".json"))
			.sort((left, right) => left.localeCompare(right))
		const profiles = []

		for(const fileName of fileNames) {
			const batchProfiles = JSON.parse(await fs.readFile(path.join(batchesDir, fileName), "utf8"))
			if(Array.isArray(batchProfiles)) profiles.push(...batchProfiles)
		}

		return profiles
	} catch {
		return []
	}
}

export async function clearDisposableBackfillState(options = {}) {
	await fs.rm(getDisposableBackfillStatePath(options), { force: true })
	await fs.rm(getDisposableBackfillBatchesDir(options), { recursive: true, force: true })
}
