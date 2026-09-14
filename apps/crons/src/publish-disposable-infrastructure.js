import "@repo/core/dotenv"

import logger from "@repo/core/logger"
import redis from "@repo/core/redis"
import knex from "@repo/db/knex"

import { publishDisposableInfrastructure } from "./libs/disposable-infrastructure-publisher.js"

const dryRun = process.argv.includes("--dry-run")
const quiet = process.argv.includes("--quiet")
const refreshAll = process.argv.includes("--all")
const startedAt = Date.now()
const runtimeEnv = refreshAll
	? {
		...process.env,
		DISPOSABLE_INFRASTRUCTURE_MX_REFRESH_LIMIT: String(Number.MAX_SAFE_INTEGER)
	}
	: process.env
const progressState = {
	lastMxCompleted: 0,
	lastMxLoggedAt: 0
}

function formatDetails(details = {}) {
	const entries = Object.entries(details)
		.filter(([, value]) => value !== undefined && value !== null && value !== "")
	if(entries.length === 0) return ""
	return ` (${entries.map(([key, value]) => `${key}: ${value}`).join(", ")})`
}

function logProgress(message, details) {
	if(quiet) return
	if(message === "mx refresh progress") {
		const completed = Number(details?.completed || 0)
		const total = Number(details?.total || 0)
		const now = Date.now()
		const shouldLog = completed === total
			|| completed - progressState.lastMxCompleted >= 250
			|| now - progressState.lastMxLoggedAt >= 10000
		if(!shouldLog) return
		progressState.lastMxCompleted = completed
		progressState.lastMxLoggedAt = now
		const percent = total > 0 ? `, ${((completed / total) * 100).toFixed(1)}%` : ""
		console.log(`[disposable-infrastructure] mx refresh ${completed}/${total}${percent} (succeeded: ${details.succeeded || 0}, failed: ${details.failed || 0}, skipped: ${details.skipped || 0})`)
		return
	}
	console.log(`[disposable-infrastructure] ${message}${formatDetails(details)}`)
}

function printSummary(result) {
	if(quiet) return
	const counts = result.summary?.counts || {}
	const diffSummary = result.diffs || {}
	const mxRefresh = result.summary?.mx_refresh || {}
	const source = result.summary?.source || {}
	const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)

	console.log("")
	console.log("Disposable infrastructure publish summary")
	console.log(`Status: ${result.status}${result.reason ? ` (${result.reason})` : ""}`)
	if(result.outputDir) console.log(`Output directory: ${result.outputDir}`)
	console.log(`Elapsed: ${elapsedSeconds}s`)
	console.log(`Source: ${source.name || "unknown"}${source.version ? `@${source.version}` : ""}`)
	console.log(`Domains: ${counts.domains || 0}`)
	console.log(`Enriched domains: ${counts.enriched_domains || 0}`)
	console.log(`Providers: ${counts.providers || 0}`)
	console.log(`MX hosts: ${counts.mx_hosts || 0}`)
	console.log(`MX IPs: ${counts.mx_ips || 0} (${counts.mx_ipv4 || 0} IPv4, ${counts.mx_ipv6 || 0} IPv6)`)
	console.log(`Diffs: +${diffSummary.addedDomains || 0} domains, -${diffSummary.removedDomains || 0} domains, ${diffSummary.changedDomains || 0} changed, ${diffSummary.newProviderClusters || 0} new provider clusters`)
	console.log(`MX refresh: ${mxRefresh.attempted || 0} attempted, ${mxRefresh.succeeded || 0} succeeded, ${mxRefresh.failed || 0} failed, ${mxRefresh.skipped || 0} skipped`)
}

try {
	if(refreshAll) {
		logProgress("--all enabled; refreshing every missing MX/IP snapshot")
	}
	const result = await publishDisposableInfrastructure(redis, {
		dryRun,
		loggerFn: logger,
		progressFn: logProgress,
		env: runtimeEnv
	})
	printSummary(result)

	const counts = result.summary?.counts || {}
	const diffSummary = result.diffs || {}
	await logger(
		`disposable-infrastructure: ${result.status} ${counts.domains || 0} domains, ${counts.providers || 0} providers, ${counts.mx_hosts || 0} MX hosts, ${counts.mx_ips || 0} MX IPs. Diffs: +${diffSummary.addedDomains || 0} domains, -${diffSummary.removedDomains || 0} domains, ${diffSummary.changedDomains || 0} changed.`,
		process.env.SLACK_STATUS_CRON
	)
} catch(error) {
	if(!quiet) console.error(`[disposable-infrastructure] failed: ${error.message}`)
	await logger(`disposable-infrastructure: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	process.exitCode = 1
} finally {
	try {
		await redis.quit()
	} catch {}
	try {
		await knex.destroy()
	} catch {}
}
