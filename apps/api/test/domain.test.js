import assert from "node:assert"
import moment from "moment"

import { __testables, getDomainInfo, getDomainMxSnapshot } from "@repo/core/whois"
import { domainValidCheck } from "../src/checks/domain/valid.js"
import { createDomainAgeCheck } from "../src/checks/domain/ageCheck.js"
import { createDomainMxCheck, matchDisposableMxSnapshot } from "../src/checks/domain/mxCheck.js"
import { createDomainHttpsCheck } from "../src/checks/domain/https.js"
import { createCtx, withMeasuredPerformance } from "./helpers.js"

describe("domain checks", function () {
	it("skips domain validation for known email providers", async function () {
		const ctx = createCtx({
			info: {
				email_known_provider: "gmail"
			}
		})
		await domainValidCheck(ctx)
		assert.deepEqual(ctx.threats, [])
		assert.deepEqual(ctx.trust, [])
	})

	it("flags missing domains", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "user" })
			await domainValidCheck(ctx)
			assert.ok(ctx.threats.includes("domain_missing"))
			assert.equal(ctx.halt, true)
			assert.ok("domain_missing" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("flags invalid domains", async function () {
		const ctx = createCtx({ email: "user@exa_mple.com" })
		await domainValidCheck(ctx)
		assert.ok(ctx.threats.includes("domain_invalid"))
		assert.equal(ctx.halt, true)
	})

	it("trusts valid domains", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "user@example.com" })
			await domainValidCheck(ctx)
			assert.ok(ctx.trust.includes("domain_valid"))
			assert.ok("domain_valid" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("uses cached whois data when available", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ageCheck = createDomainAgeCheck({
				jsonGetFn: async () => ({
					creation: "2020-01-01",
					expiration: "2030-01-01"
				}),
				getDomainInfoFn: async () => {
					throw new Error("should not be called")
				},
				nowFactory: () => moment("2026-03-09")
			})
			const ctx = createCtx({ email: "user@example.com" })
			await ageCheck(ctx)
			assert.ok(ctx.trust.includes("domain_settled"))
			assert.ok("domain_settled" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("flags unregistered domains when both creation and expiration are missing", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ageCheck = createDomainAgeCheck({
				jsonGetFn: async () => null,
				jsonSetWithExFn: async () => {},
				getDomainInfoFn: async () => ({}),
				nowFactory: () => moment("2026-03-09")
			})
			const ctx = createCtx({ email: "user@example.com" })
			await ageCheck(ctx)
			assert.ok(ctx.threats.includes("domain_unregistered"))
			assert.equal(ctx.halt, true)
			assert.ok("domain_unregistered" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("trusts registered domains when only creation is available", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ageCheck = createDomainAgeCheck({
				jsonGetFn: async () => null,
				jsonSetWithExFn: async () => {},
				getDomainInfoFn: async () => ({
					creation: "2020-01-01T00:00:00.000Z",
					expiration: null
				}),
				nowFactory: () => moment("2026-03-09")
			})
			const ctx = createCtx({ email: "user@example.com" })
			await ageCheck(ctx)
			assert.ok(ctx.trust.includes("domain_settled"))
			assert.ok(!ctx.threats.includes("domain_unregistered"))
			assert.ok("domain_settled" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("flags expired domains", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ageCheck = createDomainAgeCheck({
				jsonGetFn: async () => null,
				jsonSetWithExFn: async () => {},
				getDomainInfoFn: async () => ({
					creation: "2020-01-01",
					expiration: "2020-12-31"
				}),
				nowFactory: () => moment("2026-03-09")
			})
			const ctx = createCtx({ email: "user@example.com" })
			await ageCheck(ctx)
			assert.ok(ctx.threats.includes("domain_expired"))
			assert.equal(ctx.halt, true)
			assert.ok("domain_expired" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("flags fresh domains", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ageCheck = createDomainAgeCheck({
				jsonGetFn: async () => null,
				jsonSetWithExFn: async () => {},
				getDomainInfoFn: async () => ({
					creation: "2026-03-05",
					expiration: "2027-03-05"
				}),
				nowFactory: () => moment("2026-03-09")
			})
			const ctx = createCtx({ email: "user@example.com" })
			await ageCheck(ctx)
			assert.ok(ctx.threats.includes("domain_fresh"))
			assert.ok("domain_fresh" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("logs and flags whois lookup errors", async function () {
		const restore = withMeasuredPerformance()
		try {
			let loggedMessage = null
			const ageCheck = createDomainAgeCheck({
				jsonGetFn: async () => null,
				getDomainInfoFn: async () => {
					throw new Error("whois failed")
				},
				loggerFn: async (message) => {
					loggedMessage = message
				}
			})
			const ctx = createCtx({ email: "user@example.com" })
			await ageCheck(ctx)
			assert.ok(ctx.threats.includes("domain_whois_error"))
			assert.equal(ctx.halt, true)
			assert.ok(loggedMessage.includes("whois failed"))
			assert.ok("domain_whois_error" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("uses the default clock for settled domains", async function () {
		const ageCheck = createDomainAgeCheck({
			jsonGetFn: async () => ({
				creation: "2020-01-01",
				expiration: "2099-01-01"
			})
		})
		const ctx = createCtx({ email: "user@example.com" })
		await ageCheck(ctx)
		assert.ok(ctx.trust.includes("domain_settled"))
	})

	it("skips age checks for known email providers", async function () {
		let called = false
		const ageCheck = createDomainAgeCheck({
			jsonGetFn: async () => {
				called = true
				return null
			}
		})
		const ctx = createCtx({
			info: {
				email_known_provider: "gmail"
			}
		})
		await ageCheck(ctx)
		assert.equal(called, false)
		assert.deepEqual(ctx.threats, [])
	})

	it("uses cached mx data when available", async function () {
		const restore = withMeasuredPerformance()
		try {
			const mxCheck = createDomainMxCheck({
				jsonGetFn: async () => ({
					mxRecords: [],
					mxResolvedAt: null,
					mxResolvedRecords: []
				})
			})
			const ctx = createCtx({ email: "user@example.com" })
			await mxCheck(ctx)
			assert.ok(ctx.threats.includes("domain_no_mx"))
			assert.ok("domain_no_mx" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("trusts domains with MX records", async function () {
		const restore = withMeasuredPerformance()
		try {
			let cached = false
			const mxCheck = createDomainMxCheck({
				jsonGetFn: async () => null,
				jsonSetWithExFn: async () => {
					cached = true
				},
				getDomainMxSnapshotFn: async () => ({
					mxRecords: [{ exchange: "mx.example.com", priority: 10 }],
					mxResolvedAt: "2026-03-11T00:00:00.000Z",
					mxResolvedRecords: [{
						exchange: "mx.example.com",
						priority: 10,
						ipv4: ["192.0.2.10"],
						ipv6: []
					}]
				}),
				matchDisposableMxFn: async () => ({
					hosts: [],
					ipv4: [],
					ipv6: []
				})
			})
			const ctx = createCtx({ email: "user@example.com" })
			await mxCheck(ctx)
			assert.ok(ctx.trust.includes("domain_with_mx"))
			assert.ok("domain_with_mx" in ctx.performance)
			assert.equal(cached, true)
		} finally {
			restore()
		}
	})

	it("logs MX lookup failures", async function () {
		let loggedMessage = null
		const mxCheck = createDomainMxCheck({
			jsonGetFn: async () => null,
			getDomainMxSnapshotFn: async () => {
				throw new Error("dns failed")
			},
			loggerFn: async (message) => {
				loggedMessage = message
			}
		})
		const ctx = createCtx({ email: "user@example.com" })
		await mxCheck(ctx)
		assert.ok(ctx.threats.includes("domain_mx_check_error"))
		assert.ok(loggedMessage.includes("dns failed"))
	})

	it("skips MX checks for known email providers", async function () {
		let called = false
		const mxCheck = createDomainMxCheck({
			getDomainMxSnapshotFn: async () => {
				called = true
				return {
					mxRecords: [],
					mxResolvedAt: null,
					mxResolvedRecords: []
				}
			}
		})
		const ctx = createCtx({
			info: {
				email_known_provider: "gmail"
			}
		})
		await mxCheck(ctx)
		assert.equal(called, false)
	})

	it("skips MX infrastructure checks when the exact domain is already disposable", async function () {
		let called = false
		const mxCheck = createDomainMxCheck({
			getDomainMxSnapshotFn: async () => {
				called = true
				return {
					mxRecords: [],
					mxResolvedAt: null,
					mxResolvedRecords: []
				}
			}
		})
		const ctx = createCtx({
			email: "user@mailinator.com",
			threats: ["email_disposable"]
		})
		await mxCheck(ctx)
		assert.equal(called, false)
	})

	it("blocks when MX hostnames overlap with disposable infrastructure", async function () {
		const restore = withMeasuredPerformance()
		try {
			let persisted = null
			const mxSnapshot = {
				mxRecords: [{ exchange: "mx1.example.com", priority: 10 }],
				mxResolvedAt: "2026-03-11T00:00:00.000Z",
				mxResolvedRecords: [{
					exchange: "mx1.example.com",
					priority: 10,
					ipv4: ["192.0.2.10"],
					ipv6: []
				}]
			}
			const mxCheck = createDomainMxCheck({
				getDomainMxSnapshotFn: async () => mxSnapshot,
				matchDisposableMxFn: async () => ({
					hosts: ["mx1.example.com"],
					ipv4: [],
					ipv6: []
				}),
				persistDisposableMxDomainFn: async (input) => {
					persisted = input
				}
			})
			const ctx = createCtx({ email: "user@example.com" })
			await mxCheck(ctx)
			assert.ok(ctx.threats.includes("domain_mx_disposable_infra"))
			assert.ok(ctx.threats.includes("email_disposable"))
			assert.deepEqual(ctx.info.domain_mx_disposable_hosts, ["mx1.example.com"])
			assert.equal(persisted.domain, "example.com")
			assert.deepEqual(persisted.mxSnapshot, mxSnapshot)
			assert.ok(!ctx.trust.includes("domain_with_mx"))
			assert.ok("domain_mx_disposable_infra" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("still blocks and logs when disposable MX persistence fails", async function () {
		let loggedMessage = null
		const mxCheck = createDomainMxCheck({
			getDomainMxSnapshotFn: async () => ({
				mxRecords: [{ exchange: "mx1.example.com", priority: 10 }],
				mxResolvedAt: "2026-03-11T00:00:00.000Z",
				mxResolvedRecords: []
			}),
			matchDisposableMxFn: async () => ({
				hosts: ["mx1.example.com"],
				ipv4: [],
				ipv6: []
			}),
			persistDisposableMxDomainFn: async () => {
				throw new Error("db down")
			},
			loggerFn: async (message) => {
				loggedMessage = message
			}
		})
		const ctx = createCtx({ email: "user@example.com" })
		await mxCheck(ctx)
		assert.ok(ctx.threats.includes("domain_mx_disposable_infra"))
		assert.ok(ctx.threats.includes("email_disposable"))
		assert.ok(loggedMessage.includes("db down"))
	})

	it("blocks when MX IPs overlap with disposable infrastructure", async function () {
		const mxCheck = createDomainMxCheck({
			getDomainMxSnapshotFn: async () => ({
				mxRecords: [{ exchange: "mx1.example.com", priority: 10 }],
				mxResolvedAt: "2026-03-11T00:00:00.000Z",
				mxResolvedRecords: [{
					exchange: "mx1.example.com",
					priority: 10,
					ipv4: ["192.0.2.10"],
					ipv6: ["2001:db8::10"]
				}]
			}),
			matchDisposableMxFn: async () => ({
				hosts: [],
				ipv4: ["192.0.2.10"],
				ipv6: ["2001:db8::10"]
			}),
			persistDisposableMxDomainFn: async () => {}
		})
		const ctx = createCtx({ email: "user@example.com" })
		await mxCheck(ctx)
		assert.ok(ctx.threats.includes("domain_mx_disposable_infra"))
		assert.deepEqual(ctx.info.domain_mx_disposable_ipv4, ["192.0.2.10"])
		assert.deepEqual(ctx.info.domain_mx_disposable_ipv6, ["2001:db8::10"])
	})

	it("matches MX snapshot values against Redis-backed disposable indexes", async function () {
		const membersByKey = new Map([
			["disposable_mx_hosts", new Set(["mx1.example.com"])],
			["disposable_mx_ipv4", new Set(["192.0.2.10"])],
			["disposable_mx_ipv6", new Set(["2001:db8::10"])]
		])
		const redisClient = {
			pipeline() {
				const calls = []
				return {
					sismember(key, value) {
						calls.push([key, value])
						return this
					},
					async exec() {
						return calls.map(([key, value]) => [null, membersByKey.get(key)?.has(value) ? 1 : 0])
					}
				}
			}
		}

		const matches = await matchDisposableMxSnapshot(redisClient, {
			mxRecords: [{ exchange: "mx1.example.com", priority: 10 }],
			mxResolvedRecords: [{
				exchange: "mx1.example.com",
				priority: 10,
				ipv4: ["192.0.2.10"],
				ipv6: ["2001:db8::10"]
			}]
		})

		assert.deepEqual(matches, {
			hosts: ["mx1.example.com"],
			ipv4: ["192.0.2.10"],
			ipv6: ["2001:db8::10"]
		})
	})

	it("flags certificate failures on HTTPS checks", async function () {
		const restore = withMeasuredPerformance()
		try {
			const httpsCheck = createDomainHttpsCheck({
				fetchImpl: async () => {
					const error = new Error("tls")
					error.cause = { code: "ERR_CERT_DATE_INVALID" }
					throw error
				},
				setTimeoutFn: () => 1,
				clearTimeoutFn: () => {}
			})
			const ctx = createCtx({ email: "user@example.com" })
			await httpsCheck(ctx)
			assert.ok(ctx.threats.includes("domain_no_https"))
			assert.ok("domain_no_https" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("logs non-certificate HTTPS failures without flagging", async function () {
		let loggedMessage = null
		let cleared = false
		const httpsCheck = createDomainHttpsCheck({
			fetchImpl: async () => {
				const error = new Error("network")
				error.cause = { code: "ECONNRESET" }
				throw error
			},
			loggerFn: async (message) => {
				loggedMessage = message
			},
			setTimeoutFn: () => 1,
			clearTimeoutFn: () => {
				cleared = true
			}
		})
		const ctx = createCtx({ email: "user@example.com" })
		await httpsCheck(ctx)
		assert.ok(!ctx.threats.includes("domain_no_https"))
		assert.equal(cleared, true)
		assert.ok(loggedMessage.includes("network"))
	})

	it("clears timeout on successful HTTPS checks", async function () {
		let cleared = false
		const httpsCheck = createDomainHttpsCheck({
			fetchImpl: async () => ({ ok: true }),
			setTimeoutFn: () => 1,
			clearTimeoutFn: () => {
				cleared = true
			}
		})
		const ctx = createCtx({ email: "user@example.com" })
		await httpsCheck(ctx)
		assert.equal(cleared, true)
		assert.deepEqual(ctx.threats, [])
	})

	it("skips HTTPS checks for known email providers", async function () {
		let called = false
		const httpsCheck = createDomainHttpsCheck({
			fetchImpl: async () => {
				called = true
				return { ok: true }
			}
		})
		const ctx = createCtx({
			info: {
				email_known_provider: "gmail"
			}
		})
		await httpsCheck(ctx)
		assert.equal(called, false)
	})

	it("normalizes alternate WHOIS date formats", function () {
		const whois = [
			"Domain Registration Date: 24-Sep-2021",
			"renewal date: 2027/11/05"
		].join("\n")
		assert.equal(__testables.parseWhoisCreation(whois), "2021-09-24T00:00:00.000Z")
		assert.equal(__testables.parseWhoisExpiration(whois), "2027-11-05T00:00:00.000Z")
	})

	it("collects all WHOIS status entries", function () {
		const whois = [
			"Domain Status: active",
			"Domain Status: clientTransferProhibited",
			"Status: ok"
		].join("\n")
		assert.deepEqual(__testables.parseWhoisStatus(whois), ["active", "clienttransferprohibited", "ok"])
	})

	it("extracts owner from WHOIS registrant fields", function () {
		const whois = [
			"Registrant Organization: Example LLC",
			"Registrant Name: Jane Example"
		].join("\n")
		assert.equal(__testables.parseWhoisOwner(whois), "Example LLC")
	})

	it("extracts owner from RDAP registrant entities", function () {
		const rdap = {
			entities: [
				{
					roles: ["registrar"],
					vcardArray: ["vcard", [
						["fn", {}, "text", "Example Registrar"]
					]]
				},
				{
					roles: ["registrant"],
					vcardArray: ["vcard", [
						["org", {}, "text", ["Example LLC"]],
						["fn", {}, "text", "Jane Example"]
					]]
				}
			]
		}
		assert.equal(__testables.parseRdapOwner(rdap), "Example LLC")
	})

	it("parses MX answers from DNS-over-HTTPS responses", function () {
		assert.deepEqual(__testables.parseDohMxAnswer({
			type: 15,
			data: "10 MX1.EXAMPLE.COM."
		}), {
			exchange: "mx1.example.com",
			priority: 10
		})
	})

	it("merges missing RDAP creation with WHOIS creation", async function () {
		const responses = [
			{
				ok: true,
				status: 200,
				json: async () => ({
					services: [
						[["com"], ["https://rdap.example.test"]]
					]
				})
			},
			{
				ok: true,
				status: 200,
				json: async () => ({
					events: [
						{ eventAction: "expiration", eventDate: "2030-02-01T00:00:00Z" }
					],
					status: ["active"]
				})
			}
		]
		const domainInfo = await getDomainInfo("example.com", {
			includeDns: false,
			fetchFn: async () => responses.shift(),
			whoisLookup: async () => [
				"Creation Date: 2015-01-02T03:04:05Z",
				"Domain Status: clientTransferProhibited"
			].join("\n")
		})
		assert.equal(domainInfo.creation, "2015-01-02T03:04:05.000Z")
		assert.equal(domainInfo.expiration, "2030-02-01T00:00:00.000Z")
		assert.deepEqual(domainInfo.status, ["active", "clienttransferprohibited"])
	})

	it("falls back to WHOIS owner when RDAP omits it", async function () {
		const responses = [
			{
				ok: true,
				status: 200,
				json: async () => ({
					services: [
						[["com"], ["https://rdap.example.test"]]
					]
				})
			},
			{
				ok: true,
				status: 200,
				json: async () => ({
					events: [
						{ eventAction: "registration", eventDate: "2015-01-02T03:04:05Z" },
						{ eventAction: "expiration", eventDate: "2030-02-01T00:00:00Z" }
					],
					status: ["active"]
				})
			}
		]
		const domainInfo = await getDomainInfo("example.com", {
			includeDns: false,
			includeOwner: true,
			fetchFn: async () => responses.shift(),
			whoisLookup: async () => "Registrant Organization: Example LLC"
		})
		assert.equal(domainInfo.owner, "Example LLC")
		assert.equal(domainInfo.creation, "2015-01-02T03:04:05.000Z")
		assert.equal(domainInfo.expiration, "2030-02-01T00:00:00.000Z")
	})

	it("returns normalized MX records when requested", async function () {
		const responses = [
			{
				ok: true,
				status: 200,
				json: async () => ({
					services: [
						[["com"], ["https://rdap.example.test"]]
					]
				})
			},
			{
				ok: false,
				status: 404,
				json: async () => ({})
			}
		]
		const domainInfo = await getDomainInfo("example.com", {
			includeDns: false,
			includeMx: true,
			fetchFn: async () => responses.shift(),
			whoisLookup: async () => "",
			resolveMxFn: async () => ([
				{ exchange: "MX2.example.com", priority: 20 },
				{ exchange: "mx1.example.com", priority: 10 }
			])
		})
		assert.deepEqual(domainInfo.mxRecords, [
			{ exchange: "mx1.example.com", priority: 10 },
			{ exchange: "mx2.example.com", priority: 20 }
		])
	})

	it("captures a current MX IP snapshot when requested", async function () {
		const responses = [
			{
				ok: true,
				status: 200,
				json: async () => ({
					services: [
						[["com"], ["https://rdap.example.test"]]
					]
				})
			},
			{
				ok: false,
				status: 404,
				json: async () => ({})
			}
		]
		const domainInfo = await getDomainInfo("example.com", {
			includeDns: false,
			includeMx: true,
			includeMxResolved: true,
			fetchFn: async () => responses.shift(),
			whoisLookup: async () => "",
			resolveMxFn: async () => ([
				{ exchange: "MX2.example.com", priority: 20 },
				{ exchange: "mx1.example.com", priority: 10 }
			]),
			resolve4Fn: async (hostname) => hostname === "mx1.example.com"
				? ["192.0.2.10", "192.0.2.10", "invalid"]
				: ["192.0.2.20"],
			resolve6Fn: async (hostname) => hostname === "mx1.example.com"
				? ["2001:DB8::10"]
				: []
		})

		assert.ok(Number.isFinite(Date.parse(domainInfo.mxResolvedAt)))
		assert.deepEqual(domainInfo.mxResolvedRecords, [
			{
				exchange: "mx1.example.com",
				priority: 10,
				ipv4: ["192.0.2.10"],
				ipv6: ["2001:db8::10"]
			},
			{
				exchange: "mx2.example.com",
				priority: 20,
				ipv4: ["192.0.2.20"],
				ipv6: []
			}
		])
	})

	it("falls back to DNS-over-HTTPS when native MX resolution is refused", async function () {
		const fetchFn = async (url) => {
			const href = String(url)
			if(href.includes("data.iana.org/rdap/dns.json")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						services: [
							[["com"], ["https://rdap.example.test"]]
						]
					})
				}
			}
			if(href.includes("/domain/example.com")) {
				return {
					ok: false,
					status: 404,
					json: async () => ({})
				}
			}
			if(href.includes("dns.google/resolve")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						Status: 0,
						Answer: [
							{ type: 15, data: "20 MX2.example.com." },
							{ type: 15, data: "10 mx1.example.com." }
						]
					})
				}
			}
			throw new Error(`unexpected fetch: ${href}`)
		}
		const dnsError = new Error("queryMx ECONNREFUSED example.com")
		dnsError.code = "ECONNREFUSED"
		const domainInfo = await getDomainInfo("example.com", {
			includeDns: false,
			includeMx: true,
			fetchFn,
			whoisLookup: async () => "",
			resolveMxFn: async () => {
				throw dnsError
			}
		})

		assert.deepEqual(domainInfo.mxRecords, [
			{ exchange: "mx1.example.com", priority: 10 },
			{ exchange: "mx2.example.com", priority: 20 }
		])
	})

	it("falls back to WHOIS when RDAP times out", async function () {
		const fetchFn = async (url) => {
			const href = String(url)
			if(href.includes("data.iana.org/rdap/dns.json")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						services: [
							[["com"], ["https://rdap.example.test"]]
						]
					})
				}
			}

			await new Promise(resolve => setTimeout(resolve, 25))
			return {
				ok: true,
				status: 200,
				json: async () => ({})
			}
		}
		const domainInfo = await getDomainInfo("example.com", {
			includeDns: false,
			fetchFn,
			rdapTimeoutMs: 5,
			whoisLookup: async () => [
				"Creation Date: 2015-01-02T03:04:05Z",
				"Expiration Date: 2030-02-01T00:00:00Z"
			].join("\n")
		})

		assert.equal(domainInfo.creation, "2015-01-02T03:04:05.000Z")
		assert.equal(domainInfo.expiration, "2030-02-01T00:00:00.000Z")
		assert.ok(domainInfo.rdapError.includes("timed out"))
	})

	it("limits MX hostname resolution concurrency", async function () {
		let activeLookups = 0
		let maxConcurrentLookups = 0
		const mxSnapshot = await getDomainMxSnapshot("example.com", {
			resolveMxFn: async () => ([
				{ exchange: "mx1.example.com", priority: 10 },
				{ exchange: "mx2.example.com", priority: 20 },
				{ exchange: "mx3.example.com", priority: 30 }
			]),
			resolve4Fn: async () => {
				activeLookups += 1
				maxConcurrentLookups = Math.max(maxConcurrentLookups, activeLookups)
				await new Promise(resolve => setTimeout(resolve, 10))
				activeLookups -= 1
				return ["192.0.2.10"]
			},
			resolve6Fn: async () => [],
			resolveConcurrency: 2
		})

		assert.equal(mxSnapshot.mxResolvedRecords.length, 3)
		assert.equal(maxConcurrentLookups, 2)
	})
})
