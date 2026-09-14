import "@repo/core/dotenv"

import logger from "@repo/core/logger"
import redis from "@repo/core/redis"
import knex from "@repo/db/knex"
import {
	applyDisposableEnrichment,
	applyDisposableEnrichmentFailure,
	clearDisposableMxRefreshSchedule,
	createDisposableProfile,
	createRemovedDisposableProfile,
	DISPOSABLE_WEEK_MS,
	queueDisposableMxRefresh,
	sortDisposableDomains,
	shouldRefreshDisposableMxSnapshot
} from "@repo/core/disposable-domains"
import { getDomainInfo } from "@repo/core/whois"

import {
	assertDisposableDomainProfileSchema,
	fetchDisposableDomains,
	getDueDisposableDomains,
	listDisposableDomains,
	loadDisposableProfiles,
	saveDisposableProfiles,
	selectRemovedDisposableSourceDomains,
	sleep,
	writeDisposableSet
} from "./libs/disposable-emails.js"
import {
	loadDisposablePackageArtifacts,
	publishDisposableDomains
} from "./libs/disposable-publisher.js"

const enrichConcurrency = Math.max(1, Number(process.env.DISPOSABLE_ENRICH_CONCURRENCY || 2))
const enrichDelayMs = Math.max(0, Number(process.env.DISPOSABLE_ENRICH_DELAY_MS || 250))
const enrichBatchSize = Math.max(0, Number(process.env.DISPOSABLE_ENRICH_BATCH_SIZE || 0))
const publishDryRun = process.argv.includes("--dry-run")

async function syncDisposableProfiles({ now, domains }) {
	const previousDomains = await listDisposableDomains()
	const previousDomainSet = new Set(previousDomains)
	const profilesByDomain = await loadDisposableProfiles(redis, previousDomains)
	const removedDomains = selectRemovedDisposableSourceDomains(previousDomains, domains, profilesByDomain)
	const removedDomainSet = new Set(removedDomains)
	const activeDomains = sortDisposableDomains([
		...domains,
		...previousDomains.filter(domain => !removedDomainSet.has(domain))
	])
	const isBootstrapRun = previousDomains.length === 0
	const profilesToSave = []

	for(const domain of domains) {
		const existingProfile = profilesByDomain.get(domain) || null
		const isNewDomain = !isBootstrapRun && !previousDomainSet.has(domain)
		profilesToSave.push(createDisposableProfile(domain, {
			now,
			existingProfile,
			isNewDomain,
			source: "source"
		}))
	}

	for(const domain of removedDomains) {
		const removedProfile = createRemovedDisposableProfile(profilesByDomain.get(domain), { now })
		if(removedProfile) profilesToSave.push(removedProfile)
	}

	await writeDisposableSet(redis, activeDomains)
	await saveDisposableProfiles(redis, profilesToSave)

	return {
		previousDomains,
		removedDomains
	}
}

async function enrichDueProfiles({ now }) {
	const dueDomains = await getDueDisposableDomains(redis, {
		now,
		limit: enrichBatchSize
	})
	if(dueDomains.length === 0) return []

	const profilesByDomain = await loadDisposableProfiles(redis, dueDomains)
	const enrichedProfiles = []

	for(let index = 0; index < dueDomains.length; index += enrichConcurrency) {
		const batch = dueDomains.slice(index, index + enrichConcurrency)
		const batchResults = await Promise.all(batch.map(async (domain) => {
			const existingProfile = profilesByDomain.get(domain) || createDisposableProfile(domain, { now })

			try {
				const domainInfo = await getDomainInfo(domain, {
					includeDns: false,
					includeMx: true,
					includeMxResolved: false,
					includeOwner: true
				})
				const enrichedProfile = applyDisposableEnrichment(existingProfile, domainInfo, {
					now: new Date()
				})
				return shouldRefreshDisposableMxSnapshot(existingProfile, enrichedProfile, {
					now: new Date(),
					maxAgeMs: DISPOSABLE_WEEK_MS
				})
					? queueDisposableMxRefresh(enrichedProfile, {
						now: new Date()
					})
					: clearDisposableMxRefreshSchedule(enrichedProfile)
			} catch(error) {
				await logger(`disposable-enrich: ${error.message} (${domain})`, process.env.SLACK_ERRORS_CRON)
				return applyDisposableEnrichmentFailure(existingProfile, error, {
					now: new Date()
				})
			}
		}))

		enrichedProfiles.push(...batchResults)

		if(index + enrichConcurrency < dueDomains.length && enrichDelayMs > 0) {
			await sleep(enrichDelayMs)
		}
	}

	await saveDisposableProfiles(redis, enrichedProfiles)
	return enrichedProfiles
}

try {
	await assertDisposableDomainProfileSchema()

	const now = new Date()
	const domains = await fetchDisposableDomains({
		loggerFn: logger
	})
	const syncResult = await syncDisposableProfiles({
		now,
		domains
	})
	const enrichedProfiles = await enrichDueProfiles({ now })
	const artifacts = await loadDisposablePackageArtifacts(redis)
	const publishResult = await publishDisposableDomains({
		artifacts,
		dryRun: publishDryRun,
		loggerFn: logger
	})

	await logger(
		`disposable: refreshed ${domains.length} domains, removed ${syncResult.removedDomains.length}, enriched ${enrichedProfiles.length}, publish ${publishResult.status}.`,
		process.env.SLACK_STATUS_CRON
	)
} catch(error) {
	await logger(`disposable: ${error.message}`, process.env.SLACK_ERRORS_CRON)
	process.exitCode = 1
} finally {
	try {
		await redis.quit()
	} catch {}
	try {
		await knex.destroy()
	} catch {}
}

process.exit(process.exitCode || 0)
