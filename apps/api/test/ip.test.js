import assert from "node:assert"

import { ipValidCheck } from "../src/checks/ip/valid.js"
import { ipTypeCheck } from "../src/checks/ip/type.js"
import { createIpProviderCheck, expandIPv6 } from "../src/checks/ip/provider.js"
import { createIpTorCheck } from "../src/checks/ip/tor.js"
import { createIpAwsCheck } from "../src/checks/ip/aws.js"
import { createIpCloudflareCheck } from "../src/checks/ip/cloudflare.js"
import { createIpiCloudCheck } from "../src/checks/ip/icloud.js"
import { createSpamhausDropCheck } from "../src/checks/ip/spamhaus.js"
import { createBlocklistUaCheck } from "../src/checks/ip/blocklistUa.js"
import { createCtx, withMeasuredPerformance } from "./helpers.js"

describe("ip checks", function () {
	it("flags invalid IPs", function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ ip: "not-an-ip" })
			ipValidCheck(ctx)
			assert.ok(ctx.threats.includes("ip_invalid"))
			assert.ok("ip_invalid" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("does not flag valid IPs", function () {
		const ctx = createCtx({ ip: "1.2.3.4" })
		ipValidCheck(ctx)
		assert.ok(!ctx.threats.includes("ip_invalid"))
	})

	it("ignores missing IPs during validation", function () {
		const ctx = createCtx({ ip: "" })
		ipValidCheck(ctx)
		assert.deepEqual(ctx.threats, [])
	})

	it("marks private IPs", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ ip: "10.0.0.1" })
			await ipTypeCheck(ctx)
			assert.equal(ctx.info.ip_private, true)
			assert.ok("ipCheck" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("marks IPv4 addresses", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ ip: "1.2.3.4" })
			await ipTypeCheck(ctx)
			assert.equal(ctx.info.ipv4, true)
			assert.ok("ipCheck" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("marks IPv6 addresses", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ ip: "2001:db8::1" })
			await ipTypeCheck(ctx)
			assert.equal(ctx.info.ipv6, true)
			assert.ok("ipCheck" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("ignores missing IPs during type detection", async function () {
		const ctx = createCtx({ ip: "" })
		await ipTypeCheck(ctx)
		assert.deepEqual(ctx.info, {})
	})

	it("does not assign a type to invalid public-looking IPs", async function () {
		const ctx = createCtx({ ip: "999.1.2.3" })
		await ipTypeCheck(ctx)
		assert.deepEqual(ctx.info, {})
	})

	it("expands IPv6 addresses correctly", function () {
		assert.equal(
			expandIPv6("2001:db8::1"),
			"20010db8000000000000000000000001"
		)
	})

	it("keeps fully expanded IPv6 addresses intact", function () {
		assert.equal(
			expandIPv6("2001:0db8:0000:0000:0000:ff00:0042:8329"),
			"20010db8000000000000ff0000428329"
		)
	})

	it("flags ASN lookup errors", async function () {
		let loggedMessage = null
		const check = createIpProviderCheck({
			resolveTxt: async () => {
				throw new Error("dns failed")
			},
			redisClient: {
				get: async () => null,
				hgetall: async () => ({})
			},
			setWithExFn: async () => {},
			md5Fn: (value) => value,
			loggerFn: async (message) => {
				loggedMessage = message
			}
		})
		const ctx = createCtx({ ip: "1.2.3.4", info: { ipv4: true } })
		await check(ctx)
		assert.ok(ctx.threats.includes("ip_asn_lookup_error"))
		assert.ok(loggedMessage.includes("dns failed"))
	})

	it("flags missing ASN metadata", async function () {
		const check = createIpProviderCheck({
			resolveTxt: async () => [["64512 | extra"]],
			redisClient: {
				get: async (key) => key === "asn_current_set" ? "today" : null,
				hgetall: async () => ({})
			},
			setWithExFn: async () => {},
			md5Fn: (value) => value,
			loggerFn: async () => {}
		})
		const ctx = createCtx({ ip: "1.2.3.4", info: { ipv4: true } })
		await check(ctx)
		assert.ok(ctx.threats.includes("ip_asn_not_found"))
	})

	it("marks datacenter ASNs", async function () {
		const check = createIpProviderCheck({
			resolveTxt: async () => [["64512 | extra"]],
			redisClient: {
				get: async (key) => key === "asn_current_set" ? "today" : null,
				hgetall: async () => ({
					name: "DC",
					info_type: "Content"
				})
			},
			setWithExFn: async () => {},
			md5Fn: (value) => value,
			loggerFn: async () => {}
		})
		const ctx = createCtx({ ip: "1.2.3.4", info: { ipv4: true } })
		await check(ctx)
		assert.ok(ctx.threats.includes("ip_asn_datacenter"))
		assert.equal(ctx.info.asn, "DC")
	})

	it("marks residential ASNs from cached IPv6 lookups", async function () {
		const check = createIpProviderCheck({
			resolveTxt: async () => {
				throw new Error("should not resolve")
			},
			redisClient: {
				get: async (key) => {
					if(key.startsWith("cache_dig_")) return "64513"
					if(key === "asn_current_set") return "today"
					return null
				},
				hgetall: async () => ({
					name: "ISP",
					info_type: "ISP"
				})
			},
			setWithExFn: async () => {},
			md5Fn: (value) => value,
			loggerFn: async () => {}
		})
		const ctx = createCtx({ ip: "2001:db8::1", info: { ipv6: true } })
		await check(ctx)
		assert.ok(ctx.trust.includes("ip_asn_residential"))
		assert.equal(ctx.info.asn_number, "64513")
	})

	it("skips ASN lookups without an IP or for private addresses", async function () {
		let called = false
		const check = createIpProviderCheck({
			resolveTxt: async () => {
				called = true
				return [["64512 | extra"]]
			},
			redisClient: {
				get: async () => null,
				hgetall: async () => ({})
			},
			setWithExFn: async () => {},
			md5Fn: (value) => value,
			loggerFn: async () => {}
		})

		await check(createCtx({ ip: "" }))
		await check(createCtx({ ip: "10.0.0.1", info: { ip_private: true } }))

		assert.equal(called, false)
	})

	it("defaults unknown ASN types to residential", async function () {
		const restore = withMeasuredPerformance()
		try {
			let cachedKey = null
			const check = createIpProviderCheck({
				resolveTxt: async () => [["64514 | extra"]],
				redisClient: {
					get: async (key) => key === "asn_current_set" ? "today" : null,
					hgetall: async () => ({
						name: "Unknown ISP"
					})
				},
				setWithExFn: async (key) => {
					cachedKey = key
				},
				md5Fn: (value) => value,
				loggerFn: async () => {}
			})
			const ctx = createCtx({ ip: "2001:db8::1", info: { ipv6: true } })
			await check(ctx)
			assert.ok(ctx.trust.includes("ip_asn_residential"))
			assert.equal(ctx.info.asn_type, "-")
			assert.ok(cachedKey?.startsWith("cache_dig_"))
			assert.ok("ip_asn_residential" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("flags tor exit nodes", async function () {
		const restore = withMeasuredPerformance()
		try {
			const check = createIpTorCheck({
				isIPv4InCidrsFn: async () => true
			})
			const ctx = createCtx({ ip: "1.2.3.4" })
			await check(ctx)
			assert.ok(ctx.threats.includes("ip_tor_exit_node"))
			assert.ok("ip_tor_exit_node" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("skips tor checks for private IPs", async function () {
		let called = false
		const check = createIpTorCheck({
			isIPv4InCidrsFn: async () => {
				called = true
				return true
			}
		})
		const ctx = createCtx({ ip: "10.0.0.1", info: { ip_private: true } })
		await check(ctx)
		assert.equal(called, false)
	})

	it("returns early for tor checks without an IP", async function () {
		let called = false
		const check = createIpTorCheck({
			isIPv4InCidrsFn: async () => {
				called = true
				return true
			}
		})
		await check(createCtx({ ip: "" }))
		assert.equal(called, false)
	})

	it("flags AWS and Cloudflare ranges", async function () {
		const aws = createIpAwsCheck({
			isIPv4InCidrsFn: async () => true
		})
		const cloudflare = createIpCloudflareCheck({
			isIPv6InCidrsFn: async () => true
		})
		const awsCtx = createCtx({ ip: "1.2.3.4", info: { ipv4: true } })
		const cloudflareCtx = createCtx({ ip: "2001:db8::1", info: { ipv6: true } })

		await aws(awsCtx)
		await cloudflare(cloudflareCtx)

		assert.ok(awsCtx.threats.includes("ip_aws"))
		assert.ok(cloudflareCtx.threats.includes("ip_cloudflare"))
	})

	it("skips AWS checks for private IPs and flags IPv6 ranges", async function () {
		let called = false
		const check = createIpAwsCheck({
			isIPv6InCidrsFn: async () => {
				called = true
				return true
			}
		})

		await check(createCtx({ ip: "10.0.0.1", info: { ip_private: true, ipv6: true } }))
		assert.equal(called, false)

		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ ip: "2001:db8::1", info: { ipv6: true } })
			await check(ctx)
			assert.ok(ctx.threats.includes("ip_aws"))
			assert.ok("ip_aws" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("ignores missing Cloudflare IPs and flags IPv4 ranges", async function () {
		let called = false
		const check = createIpCloudflareCheck({
			isIPv4InCidrsFn: async () => {
				called = true
				return true
			}
		})

		await check(createCtx({ ip: "" }))
		assert.equal(called, false)

		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ ip: "1.2.3.4", info: { ipv4: true } })
			await check(ctx)
			assert.ok(ctx.threats.includes("ip_cloudflare"))
			assert.ok("ip_cloudflare" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("flags iCloud relay traffic", async function () {
		const check = createIpiCloudCheck({
			isIPv6InCidrsFn: async () => true
		})
		const ctx = createCtx({ ip: "2001:db8::1", info: { ipv6: true } })
		await check(ctx)
		assert.ok(ctx.threats.includes("ip_icloud_relay"))
	})

	it("ignores private iCloud ranges and flags IPv4 relay traffic", async function () {
		let called = false
		const check = createIpiCloudCheck({
			isIPv4InCidrsFn: async () => {
				called = true
				return true
			}
		})

		await check(createCtx({ ip: "10.0.0.1", info: { ip_private: true, ipv4: true } }))
		assert.equal(called, false)

		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ ip: "1.2.3.4", info: { ipv4: true } })
			await check(ctx)
			assert.ok(ctx.threats.includes("ip_icloud_relay"))
			assert.ok("ip_icloud_relay" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("flags Spamhaus listings for IPv4 and IPv6", async function () {
		const ipv4Check = createSpamhausDropCheck({
			isIPv4InCidrsFn: async () => true
		})
		const ipv6Check = createSpamhausDropCheck({
			isIPv6InCidrsFn: async () => true
		})
		const ipv4Ctx = createCtx({ ip: "1.2.3.4", info: { ipv4: true } })
		const ipv6Ctx = createCtx({ ip: "2001:db8::1", info: { ipv6: true } })

		await ipv4Check(ipv4Ctx)
		await ipv6Check(ipv6Ctx)

		assert.ok(ipv4Ctx.threats.includes("ip_blocklist_spamhaus_drop"))
		assert.ok(ipv6Ctx.threats.includes("ip_blocklist_spamhaus_drop"))
		assert.equal(ipv4Ctx.blocklists[0].name, "Spamhaus DROP")
	})

	it("returns early for Spamhaus when no IP type is known", async function () {
		let called = false
		const check = createSpamhausDropCheck({
			isIPv4InCidrsFn: async () => {
				called = true
				return true
			}
		})
		await check(createCtx({ ip: "1.2.3.4" }))
		assert.equal(called, false)
	})

	it("skips private Spamhaus lookups and ignores clean results", async function () {
		let called = false
		const privateCheck = createSpamhausDropCheck({
			isIPv4InCidrsFn: async () => {
				called = true
				return true
			}
		})
		await privateCheck(createCtx({ ip: "10.0.0.1", info: { ipv4: true, ip_private: true } }))
		assert.equal(called, false)

		const cleanCheck = createSpamhausDropCheck({
			isIPv6InCidrsFn: async () => false
		})
		const ctx = createCtx({ ip: "2001:db8::1", info: { ipv6: true } })
		await cleanCheck(ctx)
		assert.ok(!ctx.threats.includes("ip_blocklist_spamhaus_drop"))
	})

	it("flags Blocklist.net.ua listings and skips IPv6", async function () {
		let called = false
		const check = createBlocklistUaCheck({
			isIPv4InCidrsFn: async () => {
				called = true
				return true
			}
		})
		const ipv6Ctx = createCtx({ ip: "2001:db8::1", info: { ipv6: true } })
		await check(ipv6Ctx)
		assert.equal(called, false)

		const ipv4Ctx = createCtx({ ip: "1.2.3.4" })
		await check(ipv4Ctx)
		assert.ok(ipv4Ctx.threats.includes("ip_blocklist_net_ua"))
		assert.equal(ipv4Ctx.blocklists[0].name, "BlockList.net.ua")
	})

	it("skips Blocklist.net.ua for private IPv4s and clean addresses", async function () {
		let called = false
		const check = createBlocklistUaCheck({
			isIPv4InCidrsFn: async () => {
				called = true
				return false
			}
		})

		await check(createCtx({ ip: "10.0.0.1", info: { ip_private: true } }))
		assert.equal(called, false)

		const ctx = createCtx({ ip: "1.2.3.4", info: { ipv4: true } })
		await check(ctx)
		assert.deepEqual(ctx.threats, [])
	})
})
