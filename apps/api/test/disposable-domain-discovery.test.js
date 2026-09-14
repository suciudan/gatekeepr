import assert from "node:assert/strict"

import { persistDisposableMxDiscoveredDomain } from "../src/libs/disposable-domain-discovery.js"

describe("disposable domain discovery", function () {
	it("persists and caches domains discovered through disposable MX infrastructure", async function () {
		const calls = []
		const redisClient = {
			multi() {
				return {
					sadd(...args) {
						calls.push(["sadd", ...args])
						return this
					},
					call(...args) {
						calls.push(["call", ...args])
						return this
					},
					zadd(...args) {
						calls.push(["zadd", ...args])
						return this
					},
					zrem(...args) {
						calls.push(["zrem", ...args])
						return this
					},
					async exec() {
						calls.push(["exec"])
					}
				}
			}
		}
		let savedProfiles = null
		const profile = await persistDisposableMxDiscoveredDomain({
			domain: "Example.COM",
			mxSnapshot: {
				mxRecords: [{ exchange: "MX1.TempMail.test", priority: 10 }],
				mxResolvedAt: "2026-05-12T10:00:00.000Z",
				mxResolvedRecords: [{
					exchange: "MX1.TempMail.test",
					priority: 10,
					ipv4: ["8.8.8.8"],
					ipv6: ["2001:4860:4860::8888"]
				}]
			},
			redisClient,
			db: {},
			now: "2026-05-12T09:00:00.000Z",
			loadProfilesFn: async () => new Map(),
			upsertProfilesFn: async (profiles) => {
				savedProfiles = profiles
			}
		})

		assert.equal(profile.domain, "example.com")
		assert.equal(profile.source, "mx_disposable_infrastructure")
		assert.equal(profile.isDisposable, true)
		assert.equal(profile.nextEnrichmentAt, "2026-05-12T09:00:00.000Z")
		assert.deepEqual(profile.mxRecords, [{ exchange: "mx1.tempmail.test", priority: 10 }])
		assert.deepEqual(savedProfiles, [profile])
		assert.ok(calls.some(call => call[0] === "sadd" && call[1] === "disposable_emails" && call[2] === "example.com"))
		assert.ok(calls.some(call => call[0] === "call" && call[1] === "JSON.SET" && call[2] === "disposable_domain_profile:example.com"))
		assert.ok(calls.some(call => call[0] === "sadd" && call[1] === "disposable_mx_hosts" && call[2] === "mx1.tempmail.test"))
		assert.ok(calls.some(call => call[0] === "sadd" && call[1] === "disposable_mx_ipv4" && call[2] === "8.8.8.8"))
		assert.ok(calls.some(call => call[0] === "sadd" && call[1] === "disposable_mx_ipv6" && call[2] === "2001:4860:4860::8888"))
	})
})
