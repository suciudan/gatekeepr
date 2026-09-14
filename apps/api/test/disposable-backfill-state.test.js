import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
	clearDisposableBackfillState,
	getDisposableBackfillBatchesDir,
	getDisposableBackfillStatePath,
	loadDisposableBackfillBatchProfiles,
	loadDisposableBackfillState,
	saveDisposableBackfillBatchProfiles,
	saveDisposableBackfillState
} from "../../crons/src/libs/disposable-backfill-state.js"

describe("disposable backfill state", function () {
	let tempDir

	beforeEach(async function () {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gatekeepr-backfill-state-"))
		process.env.DISPOSABLE_BACKFILL_STATE_DIR = tempDir
	})

	afterEach(async function () {
		delete process.env.DISPOSABLE_BACKFILL_STATE_DIR
		if(tempDir) {
			await fs.rm(tempDir, { recursive: true, force: true })
		}
	})

	it("persists batch snapshots and resume state", async function () {
		const options = {
			shardCount: 1,
			shardIndex: 0
		}

		await saveDisposableBackfillBatchProfiles([{
			domain: "alpha.com",
			lastEnrichedAt: "2026-03-12T00:00:00.000Z"
		}], {
			...options,
			batchNumber: 1
		})
		await saveDisposableBackfillBatchProfiles([{
			domain: "beta.com",
			lastEnrichedAt: "2026-03-12T00:05:00.000Z"
		}], {
			...options,
			batchNumber: 2
		})
		await saveDisposableBackfillState({
			resumeAfter: "beta.com",
			completedBatches: 2
		}, options)

		assert.deepEqual(await loadDisposableBackfillBatchProfiles(options), [{
			domain: "alpha.com",
			lastEnrichedAt: "2026-03-12T00:00:00.000Z"
		}, {
			domain: "beta.com",
			lastEnrichedAt: "2026-03-12T00:05:00.000Z"
		}])
		assert.equal((await loadDisposableBackfillState(options)).resumeAfter, "beta.com")
		assert.ok((await fs.stat(getDisposableBackfillStatePath(options))).isFile())
		assert.ok((await fs.stat(getDisposableBackfillBatchesDir(options))).isDirectory())
	})

	it("clears persisted snapshots and state", async function () {
		const options = {
			shardCount: 2,
			shardIndex: 1
		}

		await saveDisposableBackfillBatchProfiles([{
			domain: "gamma.com"
		}], {
			...options,
			batchNumber: 1
		})
		await saveDisposableBackfillState({
			resumeAfter: "gamma.com"
		}, options)

		await clearDisposableBackfillState(options)

		assert.equal(await loadDisposableBackfillState(options), null)
		assert.deepEqual(await loadDisposableBackfillBatchProfiles(options), [])
	})
})
