import "@repo/core/dotenv"

import logger from "@repo/core/logger"
import redis from "@repo/core/redis"
import knex from "@repo/db/knex"
import {
	applyDisposableEnrichment,
	applyDisposableEnrichmentFailure,
	clearDisposableMxRefreshSchedule,
	createDisposableProfile,
	DISPOSABLE_WEEK_MS,
	queueDisposableMxRefresh,
	selectDisposableBackfillDomains,
	selectDisposableShardDomains,
	shouldRefreshDisposableMxSnapshot,
	sortDisposableDomains
} from "@repo/core/disposable-domains"
import { getDomainInfo } from "@repo/core/whois"

import {
	loadDisposableProfiles,
	listDisposableDomains,
	rebuildDisposableMxIndexes,
	saveDisposableProfiles,
	sleep
} from "./libs/disposable-emails.js"
import {
	clearDisposableBackfillState,
	loadDisposableBackfillBatchProfiles,
	loadDisposableBackfillState,
	saveDisposableBackfillBatchProfiles,
	saveDisposableBackfillState
} from "./libs/disposable-backfill-state.js"
import { writeDisposableExportFiles } from "./libs/disposable-export.js"

const DISPOSABLE_FULL_BACKFILL_CURSOR_KEY = "disposable_domain_backfill_cursor:all"
const DEFAULT_BACKFILL_CONCURRENCY = 12
const DEFAULT_BACKFILL_DELAY_MS = 0
const DEFAULT_BACKFILL_BATCH_SIZE = 250
const DEFAULT_BACKFILL_MX_CONCURRENCY = 10
const DEFAULT_PROFILE_SCAN_CHUNK_SIZE = 500

function hasFlag(flag) {
	return process.argv.includes(flag)
}

function readArgValue(name) {
	const prefix = `${name}=`
	const match = process.argv.find(arg => arg.startsWith(prefix))
	return match ? match.slice(prefix.length) : null
}

function readNumberOption(name, fallback, { allowZero = false } = {}) {
	const rawValue = readArgValue(name)
	if(rawValue == null || rawValue === "") return fallback
	const parsed = Number(rawValue)
	if(!Number.isFinite(parsed)) return fallback
	if(allowZero && parsed === 0) return 0
	return parsed > 0 ? parsed : fallback
}

function chunkValues(values, size) {
	const safeSize = Math.max(1, Math.floor(size))
	const chunks = []
	for(let index = 0; index < values.length; index += safeSize) {
		chunks.push(values.slice(index, index + safeSize))
	}
	return chunks
}

function formatDuration(ms) {
	if(!Number.isFinite(ms) || ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
	const seconds = ms / 1000
	if(seconds < 60) return `${seconds.toFixed(1)}s`
	const minutes = Math.floor(seconds / 60)
	const remainderSeconds = Math.round(seconds % 60)
	return `${minutes}m ${remainderSeconds}s`
}

function getCursorKey(shardCount, shardIndex) {
	if(shardCount <= 1) return DISPOSABLE_FULL_BACKFILL_CURSOR_KEY
	return `${DISPOSABLE_FULL_BACKFILL_CURSOR_KEY}:${shardCount}:${shardIndex}`
}

function buildLookupOptions({
	rdapTimeoutMs,
	whoisTimeoutMs,
	mxTimeoutMs,
	ipTimeoutMs,
	resolveConcurrency
}) {
	return {
		rdapTimeoutMs,
		whoisTimeoutMs,
		mxTimeoutMs,
		ipTimeoutMs,
		resolveConcurrency
	}
}

async function selectPendingDomains(domains, { limit = 0 } = {}) {
	const selectedDomains = []

	for(const domainChunk of chunkValues(domains, DEFAULT_PROFILE_SCAN_CHUNK_SIZE)) {
		const profilesByDomain = await loadDisposableProfiles(redis, domainChunk)
		selectedDomains.push(...selectDisposableBackfillDomains(domainChunk, profilesByDomain))
		if(limit > 0 && selectedDomains.length >= limit) {
			return selectedDomains.slice(0, limit)
		}
	}

	return selectedDomains
}

async function enrichDomain(domain, existingProfile, {
	lookupOptions,
	mxMaxAgeMs
}) {
	const now = new Date()

	try {
		const domainInfo = await getDomainInfo(domain, {
			includeDns: false,
			includeMx: true,
			includeMxResolved: false,
			includeOwner: true,
			...lookupOptions
		})
		const profile = applyDisposableEnrichment(existingProfile, domainInfo, {
			now,
			preserveMxSnapshot: true
		})

		const nextProfile = shouldRefreshDisposableMxSnapshot(existingProfile, profile, {
			now,
			maxAgeMs: mxMaxAgeMs
		})
			? queueDisposableMxRefresh(profile, { now })
			: clearDisposableMxRefreshSchedule(profile)

		return {
			domain,
			success: true,
			profile: nextProfile
		}
	} catch(error) {
		await logger(`disposable-backfill: ${error.message} (${domain})`, process.env.SLACK_ERRORS_CRON)
		return {
			domain,
			success: false,
			profile: applyDisposableEnrichmentFailure(existingProfile, error, {
				now
			})
		}
	}
}

try {
	const backfillAll = hasFlag("--all")
	const resetCursor = hasFlag("--reset")
	const exportArtifacts = hasFlag("--export") || String(process.env.DISPOSABLE_BACKFILL_EXPORT || "").toLowerCase() === "true"
	const concurrency = Math.max(1, Math.floor(readNumberOption(
		"--concurrency",
		Number(process.env.DISPOSABLE_BACKFILL_CONCURRENCY || process.env.DISPOSABLE_ENRICH_CONCURRENCY || DEFAULT_BACKFILL_CONCURRENCY)
	)))
	const delayMs = Math.max(0, Math.floor(readNumberOption(
		"--delay-ms",
		Number(process.env.DISPOSABLE_BACKFILL_DELAY_MS || process.env.DISPOSABLE_ENRICH_DELAY_MS || DEFAULT_BACKFILL_DELAY_MS),
		{ allowZero: true }
	)))
	const batchSize = Math.max(concurrency, Math.floor(readNumberOption(
		"--batch-size",
		Number(process.env.DISPOSABLE_BACKFILL_BATCH_SIZE || DEFAULT_BACKFILL_BATCH_SIZE)
	)))
	const limit = Math.max(0, Math.floor(readNumberOption(
		"--limit",
		Number(process.env.DISPOSABLE_BACKFILL_LIMIT || 0),
		{ allowZero: true }
	)))
	const mxMaxAgeMs = Math.max(0, Math.floor(readNumberOption(
		"--mx-max-age-ms",
		Number(process.env.DISPOSABLE_BACKFILL_MX_MAX_AGE_MS || DISPOSABLE_WEEK_MS),
		{ allowZero: true }
	)))
	const resolveConcurrency = Math.max(1, Math.floor(readNumberOption(
		"--mx-concurrency",
		Number(process.env.DISPOSABLE_BACKFILL_MX_CONCURRENCY || DEFAULT_BACKFILL_MX_CONCURRENCY)
	)))
	const shardCount = Math.max(1, Math.floor(readNumberOption(
		"--shard-count",
		Number(process.env.DISPOSABLE_BACKFILL_SHARD_COUNT || 1)
	)))
	const shardIndex = Math.max(0, Math.floor(readNumberOption(
		"--shard-index",
		Number(process.env.DISPOSABLE_BACKFILL_SHARD_INDEX || 0),
		{ allowZero: true }
	)))
	const rdapTimeoutMs = Math.max(0, Math.floor(readNumberOption(
		"--rdap-timeout-ms",
		Number(process.env.DISPOSABLE_RDAP_TIMEOUT_MS || 5000),
		{ allowZero: true }
	)))
	const whoisTimeoutMs = Math.max(0, Math.floor(readNumberOption(
		"--whois-timeout-ms",
		Number(process.env.DISPOSABLE_WHOIS_TIMEOUT_MS || 8000),
		{ allowZero: true }
	)))
	const mxTimeoutMs = Math.max(0, Math.floor(readNumberOption(
		"--mx-timeout-ms",
		Number(process.env.DISPOSABLE_MX_TIMEOUT_MS || 3000),
		{ allowZero: true }
	)))
	const ipTimeoutMs = Math.max(0, Math.floor(readNumberOption(
		"--ip-timeout-ms",
		Number(process.env.DISPOSABLE_IP_TIMEOUT_MS || 2000),
		{ allowZero: true }
	)))

	if(shardIndex >= shardCount) {
		throw new Error(`Shard index ${shardIndex} must be less than shard count ${shardCount}.`)
	}

	const cursorKey = getCursorKey(shardCount, shardIndex)
	const backfillStateOptions = {
		shardCount,
		shardIndex
	}

	if(backfillAll && resetCursor) {
		await redis.del(cursorKey)
		await clearDisposableBackfillState(backfillStateOptions)
	}

	const allDomains = await listDisposableDomains()
	if(allDomains.length === 0) {
		throw new Error("No disposable domains found in MySQL. Run refresh:disposable first.")
	}

	const shardDomains = selectDisposableShardDomains(allDomains, {
		shardCount,
		shardIndex
	})
	const persistedBackfillState = backfillAll ? await loadDisposableBackfillState(backfillStateOptions) : null
	let resumeAfter = backfillAll ? await redis.get(cursorKey) : null
	let recoveredProfiles = 0
	let resumeSource = resumeAfter ? "redis" : "none"

	if(backfillAll && !resumeAfter && persistedBackfillState?.resumeAfter) {
		const recoveredBatchProfiles = await loadDisposableBackfillBatchProfiles(backfillStateOptions)
		if(recoveredBatchProfiles.length > 0) {
			await saveDisposableProfiles(redis, recoveredBatchProfiles)
			await redis.set(cursorKey, persistedBackfillState.resumeAfter)
			resumeAfter = persistedBackfillState.resumeAfter
			recoveredProfiles = recoveredBatchProfiles.length
			resumeSource = "disk"
		}
	}

	const targetSourceDomains = backfillAll
		? selectDisposableBackfillDomains(shardDomains, new Map(), {
			includeEnriched: true,
			resumeAfter
		})
		: await selectPendingDomains(shardDomains, { limit })
	const targetDomains = !backfillAll || limit === 0
		? targetSourceDomains
		: targetSourceDomains.slice(0, limit)
	const completedFullRun = backfillAll && targetDomains.length === targetSourceDomains.length
	const lookupOptions = buildLookupOptions({
		rdapTimeoutMs,
		whoisTimeoutMs,
		mxTimeoutMs,
		ipTimeoutMs,
		resolveConcurrency: 1
	})

	if(backfillAll && targetSourceDomains.length === 0 && resumeAfter) {
		await redis.del(cursorKey)
		await clearDisposableBackfillState(backfillStateOptions)
	}

	console.log(JSON.stringify({
		mode: backfillAll ? "all" : "pending",
		totalDomains: allDomains.length,
		shardDomains: shardDomains.length,
		targetDomains: targetSourceDomains.length,
		processingDomains: targetDomains.length,
		resumeAfter,
		resumeSource,
		recoveredProfiles,
		shardCount,
		shardIndex,
		concurrency,
		batchSize,
		delayMs,
		mxMaxAgeMs,
		resolveConcurrency,
		rdapTimeoutMs,
		whoisTimeoutMs,
		mxTimeoutMs,
		ipTimeoutMs,
		exportArtifacts
	}, null, 2))

	if(targetDomains.length === 0) {
		console.log("disposable-backfill: no domains need processing.")
	} else {
		const runStartedAt = Date.now()
		let processed = 0
		let succeeded = 0
		let failed = 0

		for(let batchStart = 0; batchStart < targetDomains.length; batchStart += batchSize) {
			const batchDomains = targetDomains.slice(batchStart, batchStart + batchSize)
			const profilesByDomain = await loadDisposableProfiles(redis, batchDomains)
			const batchResults = []
			const batchNumber = Math.floor(batchStart / batchSize) + 1
			const totalBatches = Math.ceil(targetDomains.length / batchSize)
			const batchStartedAt = Date.now()

			console.log(
				`disposable-backfill: starting batch ${batchNumber}/${totalBatches} (${batchDomains.length} domains) from ${batchDomains[0]} to ${batchDomains.at(-1)}`
			)

			for(let index = 0; index < batchDomains.length; index += concurrency) {
				const slice = batchDomains.slice(index, index + concurrency)
				const sliceStartedAt = Date.now()
				const sliceOffsetStart = batchStart + index + 1
				const sliceOffsetEnd = batchStart + index + slice.length

				console.log(
					`disposable-backfill: starting slice ${sliceOffsetStart}-${sliceOffsetEnd}/${targetDomains.length} (${slice.length} domains), first ${slice[0]}`
				)
				const sliceResults = await Promise.all(slice.map(async (domain) => {
					const existingProfile = profilesByDomain.get(domain) || createDisposableProfile(domain, {
						now: new Date(),
						isNewDomain: true
					})
					return enrichDomain(domain, existingProfile, {
						lookupOptions,
						mxMaxAgeMs
					})
				}))
				batchResults.push(...sliceResults)

				const sliceSucceeded = sliceResults.filter(result => result.success).length
				const sliceFailed = sliceResults.length - sliceSucceeded

				console.log(
					`disposable-backfill: finished slice ${sliceOffsetStart}-${sliceOffsetEnd}/${targetDomains.length} in ${formatDuration(Date.now() - sliceStartedAt)}, succeeded ${sliceSucceeded}, failed ${sliceFailed}`
				)

				if(index + concurrency < batchDomains.length && delayMs > 0) {
					await sleep(delayMs)
				}
			}

			console.log(
				`disposable-backfill: saving batch ${batchNumber}/${totalBatches} (${batchResults.length} profiles) after ${formatDuration(Date.now() - batchStartedAt)}`
			)
			await saveDisposableProfiles(redis, batchResults.map(result => result.profile))

			if(backfillAll) {
				const nextResumeAfter = batchDomains.at(-1)
				await redis.set(cursorKey, nextResumeAfter)
				await saveDisposableBackfillBatchProfiles(batchResults.map(result => result.profile), {
					...backfillStateOptions,
					batchNumber
				})
				await saveDisposableBackfillState({
					resumeAfter: nextResumeAfter,
					completedBatches: batchNumber,
					totalBatches,
					lastBatchDomain: nextResumeAfter
				}, backfillStateOptions)
			}

			processed += batchDomains.length
			succeeded += batchResults.filter(result => result.success).length
			failed += batchResults.filter(result => !result.success).length

			console.log(
				`disposable-backfill: processed ${processed}/${targetDomains.length}, succeeded ${succeeded}, failed ${failed}, last ${batchDomains.at(-1)}, elapsed ${formatDuration(Date.now() - runStartedAt)}`
			)

			if(batchStart + batchSize < targetDomains.length && delayMs > 0) {
				await sleep(delayMs)
			}
		}

		if(backfillAll && completedFullRun) {
			await redis.del(cursorKey)
			await clearDisposableBackfillState(backfillStateOptions)
		}

		const activeProfiles = await loadDisposableProfiles(redis, allDomains)
		const mxIndexResult = await rebuildDisposableMxIndexes(redis, activeProfiles)

		if(exportArtifacts) {
			const exportResult = await writeDisposableExportFiles(redis)
			console.log(JSON.stringify(exportResult, null, 2))
		}

		console.log(JSON.stringify({
			mxHosts: mxIndexResult.mxHosts,
			mxIpv4: mxIndexResult.mxIpv4,
			mxIpv6: mxIndexResult.mxIpv6
		}, null, 2))

		await logger(
			`disposable-backfill: processed ${targetDomains.length} domains in ${backfillAll ? "all" : "pending"} mode with ${succeeded} successes and ${failed} failures.${exportArtifacts ? " Export updated." : ""}`,
			process.env.SLACK_STATUS_CRON
		)
	}
} catch(error) {
	await logger(`disposable-backfill: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	process.exitCode = 1
} finally {
	try {
		await redis.quit()
	} catch {}
	try {
		await knex.destroy()
	} catch {}
}
