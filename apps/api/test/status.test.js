import assert from "node:assert"

import { finalizeCtx } from "../src/libs/response.js"
import { resolveFraudStatus } from "../src/libs/status.js"
import { createCtx } from "./helpers.js"

describe("fraud status resolver", function () {
	it("returns allow when no threats are present", function () {
		assert.equal(resolveFraudStatus([]), "allow")
	})

	it("returns challenge when only non-blocking threats are present", function () {
		assert.equal(resolveFraudStatus(["domain_whois_error"]), "challenge")
	})

	it("returns challenge for suspicious plus aliases", function () {
		assert.equal(resolveFraudStatus(["email_suspicious_tag"]), "challenge")
	})

	it("returns challenge for AWS, Cloudflare, and iCloud relay ranges", function () {
		assert.equal(resolveFraudStatus(["ip_aws"]), "challenge")
		assert.equal(resolveFraudStatus(["ip_cloudflare"]), "challenge")
		assert.equal(resolveFraudStatus(["ip_icloud_relay"]), "challenge")
	})

	it("returns challenge for outdated browser user agents", function () {
		assert.equal(resolveFraudStatus(["ua_browser_outdated"]), "challenge")
		assert.equal(resolveFraudStatus(["ua_browser_unsupported"]), "challenge")
		assert.equal(resolveFraudStatus(["ua_browser_version_suspicious"]), "challenge")
	})

	it("returns block when a blocking threat is present", function () {
		assert.equal(resolveFraudStatus(["email_disposable"]), "block")
		assert.equal(resolveFraudStatus(["domain_mx_disposable_infra"]), "block")
	})

	it("returns block when blocking and non-blocking threats are mixed", function () {
		assert.equal(resolveFraudStatus(["domain_whois_error", "ip_blocklist_net_ua"]), "block")
	})

	it("returns block when suspicious plus aliases are mixed with blocking threats", function () {
		assert.equal(resolveFraudStatus(["email_suspicious_tag", "email_disposable"]), "block")
	})

	it("returns block when AWS, Cloudflare, or iCloud relay ranges are mixed with blocking threats", function () {
		assert.equal(resolveFraudStatus(["ip_aws", "email_disposable"]), "block")
		assert.equal(resolveFraudStatus(["ip_cloudflare", "ip_blocklist_spamhaus_drop"]), "block")
		assert.equal(resolveFraudStatus(["ip_icloud_relay", "email_disposable"]), "block")
	})

	it("maps each blocking separator flag to block", function () {
		for(const threat of [
			"email_local_sep_abuse",
			"email_local_double_sep",
			"email_local_sep_high_count",
			"email_local_sep_high_density"
		]) {
			assert.equal(resolveFraudStatus([threat]), "block")
		}
	})
})

describe("response finalizer", function () {
	it("adds status and removes internal-only fields", function () {
		const ctx = createCtx({
			threats: ["email_disposable", "domain_whois_error"],
			performance: { process: 1 },
			trust: ["email_passes_rfc5322"]
		})
		const result = finalizeCtx(ctx)

		assert.equal(result.status, "block")
		assert.deepEqual(result.threats, ["email_disposable", "domain_whois_error"])
		assert.ok(!("payload" in result))
		assert.ok(!("halt" in result))
		assert.ok(!("performance" in result))
		assert.ok(!("fraud_score" in result))
	})

	it("retains performance data when measurement is enabled", function () {
		process.env.MEASURE_PERFORMANCE = "true"
		try {
			const ctx = createCtx({
				performance: { process: 1 }
			})
			const result = finalizeCtx(ctx)
			assert.deepEqual(result.performance, { process: 1 })
		} finally {
			delete process.env.MEASURE_PERFORMANCE
		}
	})
})
