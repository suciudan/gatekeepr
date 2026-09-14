import "@repo/core/dotenv"

import logger from "@repo/core/logger"
import redis from "@repo/core/redis"
import knex from "@repo/db/knex"
import {
	clearDisposableMxRefreshSchedule,
	scheduleDisposableMxRefresh
} from "@repo/core/disposable-domains"
import { getDomainMxSnapshot } from "@repo/core/whois"

import {
	assertDisposableDomainProfileSchema,
	getDueDisposableMxRefreshDomains,
	listDisposableDomains,
	loadDisposableProfiles,
	rebuildDisposableMxIndexes,
	saveDisposableProfiles,
	sleep
} from "./libs/disposable-emails.js"

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

const refreshConcurrency = Math.max(1, Math.floor(readNumberOption(
	"--concurrency",
	Number(process.env.DISPOSABLE_MX_REFRESH_CONCURRENCY || process.env.DISPOSABLE_BACKFILL_MX_CONCURRENCY || 10)
)))
const refreshDelayMs = Math.max(0, Math.floor(readNumberOption(
	"--delay-ms",
	Number(process.env.DISPOSABLE_MX_REFRESH_DELAY_MS || 0),
	{ allowZero: true }
)))
const refreshBatchSize = Math.max(refreshConcurrency, Math.floor(readNumberOption(
	"--batch-size",
	Number(process.env.DISPOSABLE_MX_REFRESH_BATCH_SIZE || 250)
)))
const refreshLimit = Math.max(0, Math.floor(readNumberOption(
	"--limit",
	Number(process.env.DISPOSABLE_MX_REFRESH_LIMIT || 0),
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
const resolveConcurrency = Math.max(1, Math.floor(readNumberOption(
	"--mx-concurrency",
	Number(process.env.DISPOSABLE_MX_REFRESH_RESOLVE_CONCURRENCY || process.env.DISPOSABLE_BACKFILL_MX_CONCURRENCY || 10)
)))

async function refreshDomainMx(profile) {
	if(!profile?.domain) {
		return {
			domain: null,
			success: false,
			profile: null
		}
	}

	try {
		const mxSnapshot = await getDomainMxSnapshot(profile.domain, {
			includeResolved: true,
			mxTimeoutMs,
			ipTimeoutMs,
			resolveConcurrency
		})
		return {
			domain: profile.domain,
			success: true,
			profile: clearDisposableMxRefreshSchedule({
				...profile,
				lastEnrichmentError: null,
				mxRecords: mxSnapshot.mxRecords,
				mxResolvedAt: mxSnapshot.mxResolvedAt,
				mxResolvedRecords: mxSnapshot.mxResolvedRecords
			})
		}
	} catch(error) {
		await logger(`disposable-mx-refresh: ${error.message} (${profile.domain})`, process.env.SLACK_ERRORS_CRON)
		const failedProfile = {
			...profile,
			lastEnrichmentError: error.message,
			nextMxRefreshAt: scheduleDisposableMxRefresh(new Date(), 60 * 60 * 1000)
		}
		return {
			domain: profile.domain,
			success: false,
			profile: failedProfile
		}
	}
}

try {
	await assertDisposableDomainProfileSchema()

	const dueDomains = await getDueDisposableMxRefreshDomains(redis, {
		now: new Date(),
		limit: refreshLimit
	})
	if(dueDomains.length === 0) {
		console.log("disposable-mx-refresh: no domains need processing.")
	} else {
		const profilesByDomain = await loadDisposableProfiles(redis, dueDomains)
		let processed = 0
		let succeeded = 0
		let failed = 0

		for(let batchStart = 0; batchStart < dueDomains.length; batchStart += refreshBatchSize) {
			const batchDomains = dueDomains.slice(batchStart, batchStart + refreshBatchSize)
			const batchResults = []

			for(let index = 0; index < batchDomains.length; index += refreshConcurrency) {
				const slice = batchDomains.slice(index, index + refreshConcurrency)
				const sliceResults = await Promise.all(slice.map(async (domain) =>
					refreshDomainMx(profilesByDomain.get(domain))
				))
				batchResults.push(...sliceResults)

				if(index + refreshConcurrency < batchDomains.length && refreshDelayMs > 0) {
					await sleep(refreshDelayMs)
				}
			}

			await saveDisposableProfiles(redis, batchResults
				.map(result => result.profile)
				.filter(Boolean))
			processed += batchDomains.length
			succeeded += batchResults.filter(result => result.success).length
			failed += batchResults.filter(result => !result.success).length

			console.log(
				`disposable-mx-refresh: processed ${processed}/${dueDomains.length}, succeeded ${succeeded}, failed ${failed}, last ${batchDomains.at(-1)}`
			)
		}

		const allDomains = await listDisposableDomains()
		const activeProfiles = await loadDisposableProfiles(redis, allDomains)
		const mxIndexResult = await rebuildDisposableMxIndexes(redis, activeProfiles)

		console.log(JSON.stringify(mxIndexResult, null, 2))

		await logger(
			`disposable-mx-refresh: processed ${dueDomains.length} domains with ${succeeded} successes and ${failed} failures.`,
			process.env.SLACK_STATUS_CRON
		)
	}
} catch(error) {
	await logger(`disposable-mx-refresh: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	process.exitCode = 1
} finally {
	try {
		await redis.quit()
	} catch {}
	try {
		await knex.destroy()
	} catch {}
}
