import assert from "node:assert/strict"

import {
	applyDisposableMxSnapshot,
	createCachedAddressResolveFns,
	refreshDisposableMxProfile,
	refreshDisposableMxProfiles,
	selectDisposableMxFullRefreshDomains
} from "../../crons/src/libs/disposable-mx-full-refresh.js"

function createProfile(domain, overrides = {}) {
	return {
		domain,
		isDisposable: true,
		firstSeenAt: "2026-03-10T00:00:00.000Z",
		lastSeenAt: "2026-03-11T00:00:00.000Z",
		removedAt: null,
		lastEnrichedAt: "2026-03-12T00:00:00.000Z",
		lastEnrichmentError: "existing metadata error",
		nextEnrichmentAt: "2026-03-19T00:00:00.000Z",
		creation: "2025-01-01T00:00:00.000Z",
		expiration: "2027-01-01T00:00:00.000Z",
		owner: "Example Owner",
		status: ["active"],
		mxRecords: [],
		nextMxRefreshAt: "2026-03-13T00:00:00.000Z",
		mxResolvedAt: null,
		mxResolvedRecords: [],
		...overrides
	}
}

describe("disposable MX full refresh helpers", function () {
	it("caches repeated MX hostname address lookups across domains", async function () {
		let resolve4Calls = 0
		let resolve6Calls = 0
		const cachedResolvers = createCachedAddressResolveFns({
			resolve4Fn: async () => {
				resolve4Calls += 1
				await new Promise(resolve => setTimeout(resolve, 10))
				return ["192.0.2.10"]
			},
			resolve6Fn: async () => {
				resolve6Calls += 1
				await new Promise(resolve => setTimeout(resolve, 10))
				return ["2001:db8::10"]
			}
		})

		const result = await refreshDisposableMxProfiles([
			createProfile("alpha.test"),
			createProfile("beta.test")
		], {
			concurrency: 2,
			resolveMxFn: async () => [
				{ exchange: "mx.shared.test", priority: 10 }
			],
			resolve4Fn: cachedResolvers.resolve4Fn,
			resolve6Fn: cachedResolvers.resolve6Fn,
			resolveConcurrency: 1
		})

		assert.equal(result.succeeded, 2)
		assert.equal(resolve4Calls, 1)
		assert.equal(resolve6Calls, 1)
		assert.equal(cachedResolvers.stats.ipv4Lookups, 1)
		assert.equal(cachedResolvers.stats.ipv4CacheHits, 1)
		assert.equal(cachedResolvers.stats.ipv6Lookups, 1)
		assert.equal(cachedResolvers.stats.ipv6CacheHits, 1)
		assert.deepEqual(result.profilesToSave.map(profile => profile.mxResolvedRecords), [
			[{
				exchange: "mx.shared.test",
				priority: 10,
				ipv4: ["192.0.2.10"],
				ipv6: ["2001:db8::10"]
			}],
			[{
				exchange: "mx.shared.test",
				priority: 10,
				ipv4: ["192.0.2.10"],
				ipv6: ["2001:db8::10"]
			}]
		])
	})

	it("updates only MX snapshot fields and clears MX refresh scheduling", function () {
		const profile = createProfile("mailinator.com")
		const refreshed = applyDisposableMxSnapshot(profile, {
			mxRecords: [
				{ exchange: "mx.mailinator.com", priority: 10 }
			],
			mxResolvedAt: "2026-03-13T01:00:00.000Z",
			mxResolvedRecords: [{
				exchange: "mx.mailinator.com",
				priority: 10,
				ipv4: ["192.0.2.10"],
				ipv6: []
			}]
		})

		assert.equal(refreshed.creation, profile.creation)
		assert.equal(refreshed.expiration, profile.expiration)
		assert.equal(refreshed.owner, profile.owner)
		assert.equal(refreshed.lastEnrichedAt, profile.lastEnrichedAt)
		assert.equal(refreshed.lastEnrichmentError, profile.lastEnrichmentError)
		assert.equal(refreshed.nextEnrichmentAt, profile.nextEnrichmentAt)
		assert.equal(refreshed.nextMxRefreshAt, null)
		assert.deepEqual(refreshed.mxRecords, [
			{ exchange: "mx.mailinator.com", priority: 10 }
		])
		assert.equal(refreshed.mxResolvedAt, "2026-03-13T01:00:00.000Z")
	})

	it("skips removed or missing profiles", async function () {
		const removed = await refreshDisposableMxProfile(createProfile("removed.test", {
			isDisposable: false
		}))
		const missing = await refreshDisposableMxProfile(null)

		assert.equal(removed.skipped, true)
		assert.equal(removed.profile, null)
		assert.equal(missing.skipped, true)
		assert.equal(missing.profile, null)
	})

	it("selects deterministic shard, resume, and limit windows", function () {
		const domains = [
			"gamma.test",
			"alpha.test",
			"beta.test",
			"delta.test"
		]
		const fullSelection = selectDisposableMxFullRefreshDomains(domains, {
			resumeAfter: "alpha.test",
			limit: 2
		})

		assert.deepEqual(fullSelection, [
			"beta.test",
			"delta.test"
		])

		const shard0 = selectDisposableMxFullRefreshDomains(domains, {
			shardCount: 2,
			shardIndex: 0
		})
		const shard1 = selectDisposableMxFullRefreshDomains(domains, {
			shardCount: 2,
			shardIndex: 1
		})

		assert.deepEqual([...shard0, ...shard1].sort(), [
			"alpha.test",
			"beta.test",
			"delta.test",
			"gamma.test"
		])
		assert.equal(shard0.filter(domain => shard1.includes(domain)).length, 0)
	})

	it("summarizes failures without stopping the batch", async function () {
		const result = await refreshDisposableMxProfiles([
			createProfile("good.test"),
			createProfile("bad.test")
		], {
			concurrency: 2,
			getDomainMxSnapshotFn: async (domain) => {
				if(domain === "bad.test") throw new Error("dns timeout")
				return {
					mxRecords: [
						{ exchange: "mx.good.test", priority: 10 }
					],
					mxResolvedAt: "2026-03-13T01:00:00.000Z",
					mxResolvedRecords: []
				}
			}
		})

		assert.equal(result.succeeded, 1)
		assert.equal(result.failed, 1)
		assert.equal(result.profilesToSave.length, 1)
		assert.deepEqual(result.failureExamples, [{
			domain: "bad.test",
			error: "dns timeout"
		}])
	})
})
