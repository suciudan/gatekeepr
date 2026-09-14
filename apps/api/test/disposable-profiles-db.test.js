import assert from "node:assert/strict"

import {
	assertDisposableDomainProfileSchema,
	fromDisposableDomainProfileRow,
	toDisposableDomainProfileRow
} from "../../crons/src/libs/disposable-profiles-db.js"

describe("disposable profile db mapping", function () {
	it("serializes and deserializes disposable profiles", function () {
		const profile = {
			domain: "mailinator.com",
			source: "source",
			isDisposable: true,
			firstSeenAt: "2026-03-12T00:00:00.000Z",
			lastSeenAt: "2026-03-12T01:00:00.000Z",
			removedAt: null,
			lastEnrichedAt: "2026-03-12T02:00:00.000Z",
			lastEnrichmentError: null,
			nextEnrichmentAt: "2026-03-19T02:00:00.000Z",
			creation: "1997-08-02T04:00:00.000Z",
			expiration: "2026-08-02T04:00:00.000Z",
			owner: "Mailinator LLC",
			status: ["active"],
			mxRecords: [{ exchange: "mx.mailinator.com", priority: 10 }],
			nextMxRefreshAt: "2026-03-12T03:00:00.000Z",
			mxResolvedAt: "2026-03-12T03:05:00.000Z",
			mxResolvedRecords: [{
				exchange: "mx.mailinator.com",
				priority: 10,
				ipv4: ["1.1.1.1"],
				ipv6: ["2001:db8::1"]
			}]
		}

		const row = toDisposableDomainProfileRow(profile)
		assert.equal(row.domain, "mailinator.com")
		assert.equal(row.source, "source")
		assert.equal(row.isDisposable, true)
		assert.equal(row.statusJson, "[\"active\"]")

		assert.deepEqual(fromDisposableDomainProfileRow({
			...row,
			isDisposable: 1
		}), profile)
	})

	it("falls back to empty arrays for missing json columns", function () {
		assert.deepEqual(fromDisposableDomainProfileRow({
			domain: "example.com",
			isDisposable: 0
		}), {
			domain: "example.com",
			source: "source",
			isDisposable: false,
			firstSeenAt: null,
			lastSeenAt: null,
			removedAt: null,
			lastEnrichedAt: null,
			lastEnrichmentError: null,
			nextEnrichmentAt: null,
			creation: null,
			expiration: null,
			owner: null,
			status: [],
			mxRecords: [],
			nextMxRefreshAt: null,
			mxResolvedAt: null,
			mxResolvedRecords: []
		})
	})

	it("reports an actionable error when source column migration is missing", async function () {
		const db = {
			schema: {
				hasTable: async table => table === "disposable_domain_profile",
				hasColumn: async (table, column) => table === "disposable_domain_profile" && column !== "source"
			}
		}

		await assert.rejects(
			() => assertDisposableDomainProfileSchema({ db, force: true }),
			/missing columns: source.*yarn workspace @repo\/db migrate:latest/
		)
	})

	it("accepts the current disposable profile schema", async function () {
		const db = {
			schema: {
				hasTable: async table => table === "disposable_domain_profile",
				hasColumn: async table => table === "disposable_domain_profile"
			}
		}

		await assert.doesNotReject(() => assertDisposableDomainProfileSchema({ db, force: true }))
	})
})
