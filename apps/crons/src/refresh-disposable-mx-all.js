import "@repo/core/dotenv"

import logger from "@repo/core/logger"
import redis from "@repo/core/redis"
import knex from "@repo/db/knex"

import {
	assertDisposableDomainProfileSchema,
	listDisposableDomains,
	loadDisposableProfiles,
	rebuildDisposableMxIndexes,
	saveDisposableProfiles,
	sleep
} from "./libs/disposable-emails.js"
import {
	createCachedAddressResolveFns,
	createDnsResolveFns,
	parseDnsServers,
	refreshDisposableMxProfiles,
	selectDisposableMxFullRefreshDomains
} from "./libs/disposable-mx-full-refresh.js"
import { publishDisposableInfrastructure } from "./libs/disposable-infrastructure-publisher.js"

const DISPOSABLE_MX_FULL_REFRESH_CURSOR_KEY = "disposable_domain_mx_full_refresh_cursor"
const DEFAULT_REFRESH_CONCURRENCY = 25
const DEFAULT_REFRESH_BATCH_SIZE = 500
const DEFAULT_REFRESH_DELAY_MS = 0
const DEFAULT_MX_RESOLVE_CONCURRENCY = 10
const DEFAULT_MX_TIMEOUT_MS = 3000
const DEFAULT_IP_TIMEOUT_MS = 2000

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

function normalizeString(value) {
	return typeof value === "string" ? value.trim() : ""
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
	if(shardCount <= 1) return DISPOSABLE_MX_FULL_REFRESH_CURSOR_KEY
	return `${DISPOSABLE_MX_FULL_REFRESH_CURSOR_KEY}:${shardCount}:${shardIndex}`
}

function isTruthyEnv(value) {
	return ["1", "true", "yes", "on"].includes(normalizeString(value).toLowerCase())
}

function formatDetails(details = {}) {
	const entries = Object.entries(details)
		.filter(([, value]) => value !== undefined && value !== null && value !== "")
	if(entries.length === 0) return ""
	return ` (${entries.map(([key, value]) => `${key}: ${value}`).join(", ")})`
}

function logPublishProgress(message, details) {
	console.log(`[disposable-infrastructure] ${message}${formatDetails(details)}`)
}

function createPublishEnv() {
	const configuredMxRefreshLimit = normalizeString(process.env.DISPOSABLE_INFRASTRUCTURE_MX_REFRESH_LIMIT)
	const infrastructureDnsServers = normalizeString(process.env.DISPOSABLE_INFRASTRUCTURE_DNS_SERVERS)
	const disposableDnsServers = normalizeString(process.env.DISPOSABLE_DNS_SERVERS)

	return {
		...process.env,
		DISPOSABLE_INFRASTRUCTURE_DNS_SERVERS: infrastructureDnsServers || disposableDnsServers,
		DISPOSABLE_INFRASTRUCTURE_MX_REFRESH_LIMIT: configuredMxRefreshLimit || "0"
	}
}

async function publishAfterFullRefresh({ dryRun }) {
	console.log(`disposable-mx-full-refresh: publishing disposable infrastructure${dryRun ? " dry run" : ""}.`)
	const result = await publishDisposableInfrastructure(redis, {
		dryRun,
		loggerFn: null,
		progressFn: logPublishProgress,
		env: createPublishEnv()
	})
	const counts = result.summary?.counts || {}
	const diffSummary = result.diffs || {}

	console.log(JSON.stringify({
		publish: {
			status: result.status,
			reason: result.reason || null,
			domains: counts.domains || 0,
			providers: counts.providers || 0,
			mxHosts: counts.mx_hosts || 0,
			mxIps: counts.mx_ips || 0,
			diffs: {
				addedDomains: diffSummary.addedDomains || 0,
				removedDomains: diffSummary.removedDomains || 0,
				changedDomains: diffSummary.changedDomains || 0,
				newProviderClusters: diffSummary.newProviderClusters || 0
			}
		}
	}, null, 2))

	await logger(
		`disposable-mx-full-refresh: infrastructure publish ${result.status}${result.reason ? ` (${result.reason})` : ""}; ${counts.domains || 0} domains, ${counts.providers || 0} providers, ${counts.mx_hosts || 0} MX hosts, ${counts.mx_ips || 0} MX IPs.`,
		process.env.SLACK_STATUS_CRON
	)
}

try {
	const resetCursor = hasFlag("--reset")
	const publishAfterRefresh = hasFlag("--publish") || isTruthyEnv(process.env.DISPOSABLE_MX_FULL_REFRESH_PUBLISH)
	const publishDryRun = hasFlag("--publish-dry-run")
	const concurrency = Math.max(1, Math.floor(readNumberOption(
		"--concurrency",
		Number(process.env.DISPOSABLE_MX_FULL_REFRESH_CONCURRENCY || DEFAULT_REFRESH_CONCURRENCY)
	)))
	const delayMs = Math.max(0, Math.floor(readNumberOption(
		"--delay-ms",
		Number(process.env.DISPOSABLE_MX_FULL_REFRESH_DELAY_MS || DEFAULT_REFRESH_DELAY_MS),
		{ allowZero: true }
	)))
	const batchSize = Math.max(concurrency, Math.floor(readNumberOption(
		"--batch-size",
		Number(process.env.DISPOSABLE_MX_FULL_REFRESH_BATCH_SIZE || DEFAULT_REFRESH_BATCH_SIZE)
	)))
	const limit = Math.max(0, Math.floor(readNumberOption(
		"--limit",
		Number(process.env.DISPOSABLE_MX_FULL_REFRESH_LIMIT || 0),
		{ allowZero: true }
	)))
	const shardCount = Math.max(1, Math.floor(readNumberOption(
		"--shard-count",
		Number(process.env.DISPOSABLE_MX_FULL_REFRESH_SHARD_COUNT || 1)
	)))
	const shardIndex = Math.max(0, Math.floor(readNumberOption(
		"--shard-index",
		Number(process.env.DISPOSABLE_MX_FULL_REFRESH_SHARD_INDEX || 0),
		{ allowZero: true }
	)))
	const mxTimeoutMs = Math.max(0, Math.floor(readNumberOption(
		"--mx-timeout-ms",
		Number(process.env.DISPOSABLE_MX_TIMEOUT_MS || DEFAULT_MX_TIMEOUT_MS),
		{ allowZero: true }
	)))
	const ipTimeoutMs = Math.max(0, Math.floor(readNumberOption(
		"--ip-timeout-ms",
		Number(process.env.DISPOSABLE_IP_TIMEOUT_MS || DEFAULT_IP_TIMEOUT_MS),
		{ allowZero: true }
	)))
	const resolveConcurrency = Math.max(1, Math.floor(readNumberOption(
		"--mx-concurrency",
		Number(process.env.DISPOSABLE_MX_FULL_REFRESH_RESOLVE_CONCURRENCY || DEFAULT_MX_RESOLVE_CONCURRENCY)
	)))
	const cliResumeAfter = normalizeString(readArgValue("--resume-after"))
	const dnsServers = parseDnsServers(readArgValue("--dns-servers") || process.env.DISPOSABLE_DNS_SERVERS || "")

	if(shardIndex >= shardCount) {
		throw new Error(`Shard index ${shardIndex} must be less than shard count ${shardCount}.`)
	}

	await assertDisposableDomainProfileSchema()

	const cursorKey = getCursorKey(shardCount, shardIndex)
	if(resetCursor) {
		await redis.del(cursorKey)
	}

	const allDomains = await listDisposableDomains()
	if(allDomains.length === 0) {
		throw new Error("No disposable domains found in MySQL. Run refresh:disposable first.")
	}

	const persistedResumeAfter = resetCursor || cliResumeAfter ? null : await redis.get(cursorKey)
	const resumeAfter = cliResumeAfter || persistedResumeAfter || null
	const targetDomains = selectDisposableMxFullRefreshDomains(allDomains, {
		shardCount,
		shardIndex,
		resumeAfter,
		limit
	})

	const completedFullRun = limit === 0 && targetDomains.length > 0
	const dnsResolveFns = createDnsResolveFns({ dnsServers })
	const cachedAddressResolveFns = createCachedAddressResolveFns({
		resolve4Fn: dnsResolveFns.resolve4Fn,
		resolve6Fn: dnsResolveFns.resolve6Fn
	})
	const runStartedAt = Date.now()
	let processed = 0
	let succeeded = 0
	let failed = 0
	let skipped = 0
	const failureExamples = []

	console.log(JSON.stringify({
		mode: "mx_full_refresh",
		totalDomains: allDomains.length,
		targetDomains: targetDomains.length,
		resumeAfter,
		resumeSource: cliResumeAfter ? "cli" : (persistedResumeAfter ? "redis" : "none"),
		shardCount,
		shardIndex,
		concurrency,
		batchSize,
		delayMs,
		limit,
		mxTimeoutMs,
		ipTimeoutMs,
		resolveConcurrency,
		dnsServers: dnsResolveFns.dnsServers
	}, null, 2))

	if(targetDomains.length === 0) {
		if(resumeAfter && limit === 0) {
			await redis.del(cursorKey)
		}
		console.log("disposable-mx-full-refresh: no domains need processing.")
	} else {
		for(let batchStart = 0; batchStart < targetDomains.length; batchStart += batchSize) {
			const batchDomains = targetDomains.slice(batchStart, batchStart + batchSize)
			const batchStartedAt = Date.now()
			const profilesByDomain = await loadDisposableProfiles(redis, batchDomains)
			const profiles = batchDomains
				.map(domain => profilesByDomain.get(domain))
				.filter(Boolean)

			const batchResult = await refreshDisposableMxProfiles(profiles, {
				concurrency,
				resolveMxFn: dnsResolveFns.resolveMxFn,
				resolve4Fn: cachedAddressResolveFns.resolve4Fn,
				resolve6Fn: cachedAddressResolveFns.resolve6Fn,
				mxTimeoutMs,
				ipTimeoutMs,
				resolveConcurrency
			})

			await saveDisposableProfiles(redis, batchResult.profilesToSave)

			processed += batchDomains.length
			succeeded += batchResult.succeeded
			failed += batchResult.failed
			skipped += batchResult.skipped
			for(const example of batchResult.failureExamples) {
				if(failureExamples.length < 10) failureExamples.push(example)
			}

			const nextResumeAfter = batchDomains.at(-1)
			await redis.set(cursorKey, nextResumeAfter)

			console.log(JSON.stringify({
				batch: Math.floor(batchStart / batchSize) + 1,
				processed,
				total: targetDomains.length,
				succeeded,
				failed,
				skipped,
				last: nextResumeAfter,
				batchDuration: formatDuration(Date.now() - batchStartedAt),
				elapsed: formatDuration(Date.now() - runStartedAt),
				addressCache: cachedAddressResolveFns.stats
			}, null, 2))

			if(batchStart + batchSize < targetDomains.length && delayMs > 0) {
				await sleep(delayMs)
			}
		}

		if(completedFullRun) {
			await redis.del(cursorKey)
		}

		const activeProfiles = await loadDisposableProfiles(redis, allDomains)
		const mxIndexResult = await rebuildDisposableMxIndexes(redis, activeProfiles)
		const summary = {
			processed,
			succeeded,
			failed,
			skipped,
			failureExamples,
			addressCache: cachedAddressResolveFns.stats,
			mxIndexes: mxIndexResult,
			duration: formatDuration(Date.now() - runStartedAt)
		}

		console.log(JSON.stringify(summary, null, 2))

		await logger(
			`disposable-mx-full-refresh: processed ${processed} domains with ${succeeded} successes, ${failed} failures, ${skipped} skipped. MX indexes: ${mxIndexResult.mxHosts} hosts, ${mxIndexResult.mxIpv4} IPv4, ${mxIndexResult.mxIpv6} IPv6.`,
			process.env.SLACK_STATUS_CRON
		)
	}

	if(publishAfterRefresh || publishDryRun) {
		await publishAfterFullRefresh({ dryRun: publishDryRun })
	}
} catch(error) {
	await logger(`disposable-mx-full-refresh: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	process.exitCode = 1
} finally {
	try {
		await redis.quit()
	} catch {}
	try {
		await knex.destroy()
	} catch {}
}
