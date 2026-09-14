import assert from "node:assert"

import {
	applyDisposableEnrichment,
	clearDisposableMxRefreshSchedule,
	createDisposableMxIndexData,
	applyDisposableEnrichmentFailure,
	createDisposablePackageArtifacts,
	createDisposableProviderDirectory,
	createDisposableProviderPathSlug,
	createDisposableProviderSlug,
	createDisposableProfile,
	createRemovedDisposableProfile,
	DISPOSABLE_WEEK_MS,
	findDisposableProviderBySlug,
	getDisposableProviderDisplayDomain,
	hasDisposableProviderExcludedMxRoute,
	hasFreshDisposableMxSnapshot,
	queueDisposableMxRefresh,
	resolveDisposableLookupState,
	selectDisposableBackfillDomains,
	selectDisposableShardDomains,
	shouldRefreshDisposableMxSnapshot
} from "@repo/core/disposable-domains"

describe("disposable domain helpers", function () {
	it("enriches new domains immediately", function () {
		const now = "2026-03-11T00:00:00.000Z"
		const profile = createDisposableProfile("mailinator.com", {
			now,
			isNewDomain: true
		})

		assert.equal(profile.firstSeenAt, now)
		assert.equal(profile.lastSeenAt, now)
		assert.equal(profile.nextEnrichmentAt, now)
		assert.equal(profile.isDisposable, true)
	})

	it("spreads legacy domains across the bootstrap window", function () {
		const now = "2026-03-11T00:00:00.000Z"
		const firstProfile = createDisposableProfile("mailinator.com", { now })
		const secondProfile = createDisposableProfile("mailinator.com", { now })
		const nextMs = Date.parse(firstProfile.nextEnrichmentAt)
		const nowMs = Date.parse(now)

		assert.equal(firstProfile.nextEnrichmentAt, secondProfile.nextEnrichmentAt)
		assert.ok(nextMs >= nowMs)
		assert.ok(nextMs <= nowMs + DISPOSABLE_WEEK_MS)
	})

	it("applies successful enrichment and schedules the next weekly refresh", function () {
		const profile = createDisposableProfile("mailinator.com", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		})
		const enriched = applyDisposableEnrichment(profile, {
			creation: "2025-01-01T00:00:00.000Z",
			expiration: "2027-01-01T00:00:00.000Z",
			owner: "Mailinator LLC",
			status: ["ACTIVE", "clientTransferProhibited"],
			mxResolvedAt: "2026-03-12T00:05:00.000Z",
			mxRecords: [
				{ exchange: "mx2.mailinator.com", priority: 20 },
				{ exchange: "mx1.mailinator.com", priority: 10 }
			],
			mxResolvedRecords: [
				{
					exchange: "mx2.mailinator.com",
					priority: 20,
					ipv4: ["203.0.113.20", "203.0.113.20"],
					ipv6: []
				},
				{
					exchange: "MX1.mailinator.com",
					priority: 10,
					ipv4: ["203.0.113.10"],
					ipv6: ["2001:DB8::10", "not-an-ip"]
				}
			]
		}, {
			now: "2026-03-12T00:00:00.000Z"
		})

		assert.equal(enriched.lastEnrichedAt, "2026-03-12T00:00:00.000Z")
		assert.equal(enriched.nextEnrichmentAt, "2026-03-19T00:00:00.000Z")
		assert.deepEqual(enriched.status, ["active", "clienttransferprohibited"])
		assert.deepEqual(enriched.mxRecords, [
			{ exchange: "mx1.mailinator.com", priority: 10 },
			{ exchange: "mx2.mailinator.com", priority: 20 }
		])
		assert.equal(enriched.mxResolvedAt, "2026-03-12T00:05:00.000Z")
		assert.deepEqual(enriched.mxResolvedRecords, [
			{
				exchange: "mx1.mailinator.com",
				priority: 10,
				ipv4: ["203.0.113.10"],
				ipv6: ["2001:db8::10"]
			},
			{
				exchange: "mx2.mailinator.com",
				priority: 20,
				ipv4: ["203.0.113.20"],
				ipv6: []
			}
		])
	})

	it("retries failed enrichment on the next day", function () {
		const profile = createDisposableProfile("mailinator.com", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		})
		const failed = applyDisposableEnrichmentFailure(profile, new Error("rdap timeout"), {
			now: "2026-03-12T00:00:00.000Z"
		})

		assert.equal(failed.lastEnrichmentError, "rdap timeout")
		assert.equal(failed.nextEnrichmentAt, "2026-03-13T00:00:00.000Z")
	})

	it("preserves an existing MX snapshot during metadata-only enrichment", function () {
		const profile = applyDisposableEnrichment(createDisposableProfile("mailinator.com", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "mx1.mailinator.com", priority: 10 }
			],
			mxResolvedAt: "2026-03-11T01:00:00.000Z",
			mxResolvedRecords: [
				{
					exchange: "mx1.mailinator.com",
					priority: 10,
					ipv4: ["203.0.113.10"],
					ipv6: []
				}
			]
		}, {
			now: "2026-03-11T01:00:00.000Z"
		})

		const enriched = applyDisposableEnrichment(profile, {
			owner: "Mailinator LLC",
			mxRecords: [
				{ exchange: "mx1.mailinator.com", priority: 10 }
			]
		}, {
			now: "2026-03-12T00:00:00.000Z",
			preserveMxSnapshot: true
		})

		assert.equal(enriched.owner, "Mailinator LLC")
		assert.equal(enriched.mxResolvedAt, "2026-03-11T01:00:00.000Z")
		assert.deepEqual(enriched.mxResolvedRecords, [
			{
				exchange: "mx1.mailinator.com",
				priority: 10,
				ipv4: ["203.0.113.10"],
				ipv6: []
			}
		])
	})

	it("queues and clears dedicated MX refresh work", function () {
		const profile = applyDisposableEnrichment(createDisposableProfile("mailinator.com", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "mx1.mailinator.com", priority: 10 }
			]
		}, {
			now: "2026-03-11T00:00:00.000Z"
		})
		const queued = queueDisposableMxRefresh(profile, {
			now: "2026-03-12T00:00:00.000Z"
		})
		const cleared = clearDisposableMxRefreshSchedule(queued)

		assert.equal(queued.nextMxRefreshAt, "2026-03-12T00:00:00.000Z")
		assert.equal(cleared.nextMxRefreshAt, null)
	})

	it("builds flat and extended artifacts while excluding removed domains", function () {
		const activeProfile = applyDisposableEnrichment(createDisposableProfile("mailinator.com", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		}), {
			creation: "2025-01-01T00:00:00.000Z",
			expiration: "2027-01-01T00:00:00.000Z",
			owner: "Mailinator LLC",
			status: ["active"],
			mxRecords: []
		}, {
			now: "2026-03-11T00:00:00.000Z"
		})
		const removedProfile = createRemovedDisposableProfile(createDisposableProfile("old-domain.com", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		}), {
			now: "2026-03-12T00:00:00.000Z"
		})
		const artifacts = createDisposablePackageArtifacts([activeProfile, removedProfile])
		const extended = JSON.parse(artifacts.disposableExtendedJson)

		assert.deepEqual(JSON.parse(artifacts.disposableJson), ["mailinator.com"])
		assert.equal(artifacts.disposableTxt, "mailinator.com\n")
		assert.ok("mailinator.com" in extended)
		assert.ok(!("old-domain.com" in extended))
		assert.equal(extended["mailinator.com"].owner, "Mailinator LLC")
		assert.deepEqual(extended["mailinator.com"].mxResolvedRecords, [])
	})

	it("builds active disposable MX infrastructure indexes without removed domains", function () {
		const activeProfile = applyDisposableEnrichment(createDisposableProfile("mailinator.com", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "mx2.mailinator.com", priority: 20 },
				{ exchange: "mx1.mailinator.com", priority: 10 }
			],
			mxResolvedRecords: [
				{
					exchange: "mx1.mailinator.com",
					priority: 10,
					ipv4: ["203.0.113.10"],
					ipv6: ["2001:db8::10"]
				},
				{
					exchange: "mx2.mailinator.com",
					priority: 20,
					ipv4: ["203.0.113.20"],
					ipv6: []
				}
			]
		}, {
			now: "2026-03-12T00:00:00.000Z"
		})
		const removedProfile = createRemovedDisposableProfile(applyDisposableEnrichment(createDisposableProfile("old-domain.com", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "mx.old-domain.com", priority: 10 }
			],
			mxResolvedRecords: [
				{
					exchange: "mx.old-domain.com",
					priority: 10,
					ipv4: ["198.51.100.10"],
					ipv6: []
				}
			]
		}, {
			now: "2026-03-12T00:00:00.000Z"
		}), {
			now: "2026-03-13T00:00:00.000Z"
		})
		const cloudflareRouteProfile = applyDisposableEnrichment(createDisposableProfile("cloudflare-route.test", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "route.mx.cloudflare.net", priority: 10 }
			],
			mxResolvedRecords: [
				{
					exchange: "route.mx.cloudflare.net",
					priority: 10,
					ipv4: ["198.51.100.20"],
					ipv6: ["2001:db8::20"]
				}
			]
		}, {
			now: "2026-03-12T00:00:00.000Z"
		})

		assert.equal(hasDisposableProviderExcludedMxRoute(cloudflareRouteProfile), true)
		assert.deepEqual(createDisposableMxIndexData([activeProfile, removedProfile, cloudflareRouteProfile]), {
			mxHosts: ["mx1.mailinator.com", "mx2.mailinator.com"],
			mxIpv4: ["203.0.113.10", "203.0.113.20"],
			mxIpv6: ["2001:db8::10"]
		})
	})

	it("builds provider groups from MX hostname infrastructure", function () {
		const firstProfile = applyDisposableEnrichment(createDisposableProfile("alpha.test", {
			now: "2026-03-10T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "mx2.disposable.test", priority: 20 },
				{ exchange: "mx.disposable.test", priority: 10 }
			],
			mxResolvedAt: "2026-03-10T01:00:00.000Z",
			mxResolvedRecords: [
				{
					exchange: "mx.disposable.test",
					priority: 10,
					ipv4: ["203.0.113.10"],
					ipv6: []
				}
			]
		}, {
			now: "2026-03-10T01:00:00.000Z"
		})
		const secondProfile = applyDisposableEnrichment(createDisposableProfile("beta.test", {
			now: "2026-03-12T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "mx.disposable.test", priority: 10 }
			],
			mxResolvedAt: "2026-03-12T01:00:00.000Z",
			mxResolvedRecords: [
				{
					exchange: "mx.disposable.test",
					priority: 10,
					ipv4: ["203.0.113.10", "203.0.113.11"],
					ipv6: ["2001:db8::11"]
				}
			]
		}, {
			now: "2026-03-12T01:00:00.000Z"
		})
		const otherProviderProfile = applyDisposableEnrichment(createDisposableProfile("gamma.test", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "mx.other.test", priority: 10 }
			]
		}, {
			now: "2026-03-11T01:00:00.000Z"
		})
		const removedProfile = createRemovedDisposableProfile(applyDisposableEnrichment(createDisposableProfile("removed.test", {
			now: "2026-03-13T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "mx.disposable.test", priority: 10 }
			]
		}, {
			now: "2026-03-13T01:00:00.000Z"
		}), {
			now: "2026-03-14T00:00:00.000Z"
		})
		const providers = createDisposableProviderDirectory([
			firstProfile,
			secondProfile,
			otherProviderProfile,
			removedProfile,
			createDisposableProfile("missing-mx.test", {
				now: "2026-03-15T00:00:00.000Z",
				isNewDomain: true
			})
		])

		assert.equal(providers.length, 2)
		assert.equal(providers[0].type, "mx_host")
		assert.equal(providers[0].key, "disposable.test")
		assert.equal(providers[0].label, "disposable.test")
		assert.equal(providers[0].slug, createDisposableProviderSlug("disposable.test", "mx_host"))
		assert.equal(providers[0].pathSlug, createDisposableProviderPathSlug("disposable.test", "mx_host"))
		assert.equal(providers[0].domainCount, 2)
		assert.deepEqual(providers[0].domains.map(domain => domain.domain), [
			"beta.test",
			"alpha.test"
		])
		assert.deepEqual(providers[0].mxHosts, [
			"mx.disposable.test",
			"mx2.disposable.test"
		])
		assert.deepEqual(providers[0].mxIpv4, [
			"203.0.113.10",
			"203.0.113.11"
		])
		assert.deepEqual(providers[0].mxIpv6, [
			"2001:db8::11"
		])
		assert.equal(providers[1].key, "other.test")
		assert.equal(providers[1].domainCount, 1)
	})

	it("excludes provider groups routed through Cloudflare MX", function () {
		const cloudflareProfile = applyDisposableEnrichment(createDisposableProfile("cloudflare-route.test", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "alpha.mx.cloudflare.net", priority: 10 }
			],
			mxResolvedRecords: [
				{
					exchange: "alpha.mx.cloudflare.net",
					priority: 10,
					ipv4: ["198.51.100.10"],
					ipv6: []
				}
			]
		}, {
			now: "2026-03-11T01:00:00.000Z"
		})
		const directCloudflareProfile = applyDisposableEnrichment(createDisposableProfile("mx.cloudflare.net", {
			now: "2026-03-12T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "mx.cloudflare.net", priority: 10 }
			],
			mxResolvedRecords: [
				{
					exchange: "mx.cloudflare.net",
					priority: 10,
					ipv4: ["198.51.100.11"],
					ipv6: []
				}
			]
		}, {
			now: "2026-03-12T01:00:00.000Z"
		})

		assert.equal(hasDisposableProviderExcludedMxRoute(cloudflareProfile), true)
		assert.equal(hasDisposableProviderExcludedMxRoute(directCloudflareProfile), false)
		assert.deepEqual(createDisposableProviderDirectory([cloudflareProfile]), [])
	})

	it("excludes provider groups routed through shared non-disposable MX providers", function () {
		const sharedProviderProfiles = [
			["google-route.test", "aspmx.l.google.com", "198.51.100.10"],
			["googlemail-route.test", "alt1.gmail-smtp-in.l.googlemail.com", "198.51.100.11"],
			["outlook-route.test", "mail.protection.outlook.com", "198.51.100.12"],
			["amazonaws-route.test", "inbound-smtp.us-east-1.amazonaws.com", "198.51.100.13"]
		].map(([domain, exchange, ip], index) => applyDisposableEnrichment(createDisposableProfile(domain, {
			now: `2026-03-1${index}T00:00:00.000Z`,
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange, priority: 10 }
			],
			mxResolvedRecords: [
				{
					exchange,
					priority: 10,
					ipv4: [ip],
					ipv6: []
				}
			]
		}, {
			now: `2026-03-1${index}T01:00:00.000Z`
		}))

		for(const profile of sharedProviderProfiles) {
			assert.equal(hasDisposableProviderExcludedMxRoute(profile), true)
		}
		assert.deepEqual(createDisposableProviderDirectory(sharedProviderProfiles), [])
		assert.deepEqual(createDisposableMxIndexData(sharedProviderProfiles), {
			mxHosts: [],
			mxIpv4: [],
			mxIpv6: []
		})
	})

	it("ignores local and private MX infrastructure", function () {
		const localOnlyProfile = applyDisposableEnrichment(createDisposableProfile("localhost-route.test", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "localhost", priority: 10 }
			],
			mxResolvedRecords: [
				{
					exchange: "localhost",
					priority: 10,
					ipv4: ["127.0.0.1"],
					ipv6: ["::1"]
				}
			]
		}, {
			now: "2026-03-11T01:00:00.000Z"
		})
		const mixedProfile = applyDisposableEnrichment(createDisposableProfile("mixed-route.test", {
			now: "2026-03-12T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "localhost", priority: 20 },
				{ exchange: "mx.disposable.test", priority: 10 }
			],
			mxResolvedRecords: [
				{
					exchange: "localhost",
					priority: 20,
					ipv4: ["127.0.0.1"],
					ipv6: ["::1"]
				},
				{
					exchange: "mx.disposable.test",
					priority: 10,
					ipv4: ["203.0.113.10", "10.0.0.1"],
					ipv6: ["2001:db8::10", "::1"]
				}
			]
		}, {
			now: "2026-03-12T01:00:00.000Z"
		})

		const providers = createDisposableProviderDirectory([localOnlyProfile, mixedProfile])

		assert.equal(findDisposableProviderBySlug([localOnlyProfile], createDisposableProviderSlug("localhost", "mx_host")), null)
		assert.equal(providers.length, 1)
		assert.equal(providers[0].key, "disposable.test")
		assert.deepEqual(providers[0].mxHosts, ["mx.disposable.test"])
		assert.deepEqual(providers[0].mxIpv4, ["203.0.113.10"])
		assert.deepEqual(providers[0].mxIpv6, ["2001:db8::10"])
		assert.deepEqual(createDisposableMxIndexData([localOnlyProfile, mixedProfile]), {
			mxHosts: ["mx.disposable.test"],
			mxIpv4: ["203.0.113.10"],
			mxIpv6: ["2001:db8::10"]
		})
	})

	it("collapses provider domains to display domains before grouping", function () {
		assert.equal(getDisposableProviderDisplayDomain("131ochman.emlhub.com"), "emlhub.com")
		assert.equal(getDisposableProviderDisplayDomain("0gyenlcce.dropmail.me"), "dropmail.me")
		assert.equal(getDisposableProviderDisplayDomain("mail.example.co.uk"), "example.co.uk")

		const profiles = [
			"131ochman.emlhub.com",
			"15375dbmobbii.emlhub.com",
			"dropmail.me"
		].map((domain, index) => applyDisposableEnrichment(createDisposableProfile(domain, {
			now: `2026-03-1${index}T00:00:00.000Z`,
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "mx.disposable.test", priority: 10 }
			],
			mxResolvedRecords: [
				{
					exchange: "mx.disposable.test",
					priority: 10,
					ipv4: ["203.0.113.10"],
					ipv6: []
				}
			]
		}, {
			now: `2026-03-1${index}T01:00:00.000Z`
		}))
		const provider = createDisposableProviderDirectory(profiles)[0]

		assert.equal(provider.key, "disposable.test")
		assert.equal(provider.domainCount, 2)
		assert.equal(provider.sourceDomainCount, 3)
		assert.deepEqual(provider.domains.map(domain => domain.domain), [
			"dropmail.me",
			"emlhub.com"
		])
		assert.deepEqual(provider.domains.find(domain => domain.domain === "emlhub.com").sourceDomains, [
			"131ochman.emlhub.com",
			"15375dbmobbii.emlhub.com"
		])
	})

	it("finds provider groups by slug", function () {
		const profile = applyDisposableEnrichment(createDisposableProfile("mailinator.com", {
			now: "2026-03-11T00:00:00.000Z",
			isNewDomain: true
		}), {
			mxRecords: [
				{ exchange: "mx.mailinator.com", priority: 10 }
			],
			mxResolvedRecords: [
				{
					exchange: "mx.mailinator.com",
					priority: 10,
					ipv4: ["203.0.113.10"],
					ipv6: []
				}
			]
		}, {
			now: "2026-03-11T01:00:00.000Z"
		})
		const slug = createDisposableProviderSlug("mailinator.com", "mx_host")

		assert.equal(findDisposableProviderBySlug([profile], slug).key, "mailinator.com")
		assert.equal(findDisposableProviderBySlug([profile], "mailinator.com").key, "mailinator.com")
		assert.equal(findDisposableProviderBySlug([profile], "missing"), null)
	})

	it("resolves lookup states for invalid, pending, enriched, and missing domains", function () {
		const invalid = resolveDisposableLookupState("   ")
		const pending = resolveDisposableLookupState("user@mailinator.com", {
			isDisposable: true,
			profile: createDisposableProfile("mailinator.com", {
				now: "2026-03-11T00:00:00.000Z",
				isNewDomain: true
			})
		})
		const enriched = resolveDisposableLookupState("mailinator.com", {
			isDisposable: true,
			profile: applyDisposableEnrichment(createDisposableProfile("mailinator.com", {
				now: "2026-03-11T00:00:00.000Z",
				isNewDomain: true
			}), {}, {
				now: "2026-03-12T00:00:00.000Z"
			})
		})
		const notDisposable = resolveDisposableLookupState("gmail.com", {
			isDisposable: false
		})

		assert.equal(invalid.state, "invalid")
		assert.equal(pending.state, "disposable_pending")
		assert.equal(pending.domain, "mailinator.com")
		assert.equal(enriched.state, "disposable_enriched")
		assert.equal(notDisposable.state, "not_disposable")
	})

	it("selects pending backfill domains and retries failed enrichments", function () {
		const domains = [
			"pending.com",
			"enriched.com",
			"retry.com"
		]
		const profilesByDomain = new Map([
			["enriched.com", {
				domain: "enriched.com",
				lastEnrichedAt: "2026-03-11T00:00:00.000Z",
				lastEnrichmentError: null
			}],
			["retry.com", {
				domain: "retry.com",
				lastEnrichedAt: "2026-03-11T00:00:00.000Z",
				lastEnrichmentError: "rdap timeout"
			}]
		])

		assert.deepEqual(selectDisposableBackfillDomains(domains, profilesByDomain), [
			"pending.com",
			"retry.com"
		])
	})

	it("supports full backfill selection and resume cursors", function () {
		const domains = [
			"beta.com",
			"alpha.com",
			"gamma.com"
		]
		const profilesByDomain = new Map([
			["alpha.com", {
				domain: "alpha.com",
				lastEnrichedAt: "2026-03-11T00:00:00.000Z",
				lastEnrichmentError: null
			}]
		])

		assert.deepEqual(selectDisposableBackfillDomains(domains, profilesByDomain, {
			includeEnriched: true,
			resumeAfter: "alpha.com"
		}), [
			"beta.com",
			"gamma.com"
		])
	})

	it("selects stable domain shards", function () {
		const domains = [
			"alpha.com",
			"beta.com",
			"gamma.com",
			"delta.com"
		]
		const shard0 = selectDisposableShardDomains(domains, {
			shardCount: 2,
			shardIndex: 0
		})
		const shard1 = selectDisposableShardDomains(domains, {
			shardCount: 2,
			shardIndex: 1
		})

		assert.deepEqual([...shard0, ...shard1].sort(), [
			"alpha.com",
			"beta.com",
			"delta.com",
			"gamma.com"
		])
		assert.equal(shard0.filter(domain => shard1.includes(domain)).length, 0)
	})

	it("refreshes MX snapshots when missing, stale, or changed", function () {
		const now = "2026-03-20T00:00:00.000Z"
		const previousProfile = {
			mxRecords: [
				{ exchange: "mx1.mailinator.com", priority: 10 }
			],
			mxResolvedAt: "2026-03-12T00:00:00.000Z",
			mxResolvedRecords: [
				{
					exchange: "mx1.mailinator.com",
					priority: 10,
					ipv4: ["203.0.113.10"],
					ipv6: []
				}
			]
		}

		assert.equal(hasFreshDisposableMxSnapshot(previousProfile, { now }), false)
		assert.equal(shouldRefreshDisposableMxSnapshot(null, {
			mxRecords: [{ exchange: "mx1.mailinator.com", priority: 10 }]
		}, { now }), true)
		assert.equal(shouldRefreshDisposableMxSnapshot(previousProfile, {
			mxRecords: [{ exchange: "mx2.mailinator.com", priority: 10 }]
		}, {
			now: "2026-03-12T12:00:00.000Z"
		}), true)
		assert.equal(shouldRefreshDisposableMxSnapshot({
			...previousProfile,
			mxResolvedAt: "2026-03-12T12:00:00.000Z"
		}, {
			mxRecords: [{ exchange: "mx1.mailinator.com", priority: 10 }]
		}, {
			now: "2026-03-12T13:00:00.000Z"
		}), false)
	})
})
