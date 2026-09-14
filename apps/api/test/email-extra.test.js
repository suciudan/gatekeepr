import assert from "node:assert"

import { emailRfc5322Check } from "../src/checks/email/rfc5322.js"
import { createEmailDisposableCheck } from "../src/checks/email/disposable.js"
import { emailSeparatorCheck } from "../src/checks/email/separator.js"
import { emailRoleCheck } from "../src/checks/email/role.js"
import { emailKnownProviderCheck, findProviderByDomain } from "../src/checks/email/provider.js"
import { createCtx, withMeasuredPerformance } from "./helpers.js"

describe("email checks", function () {
	it("passes valid RFC 5322 emails", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "user@gmail.com" })
			await emailRfc5322Check(ctx)
			assert.ok(ctx.trust.includes("email_passes_rfc5322"))
			assert.equal(ctx.halt, false)
			assert.ok("email_passes_rfc5322" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("blocks invalid RFC 5322 emails", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "not an email" })
			await emailRfc5322Check(ctx)
			assert.ok(ctx.threats.includes("email_fails_rfc5322"))
			assert.equal(ctx.halt, true)
			assert.ok("email_fails_rfc5322" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("finds known providers by domain", function () {
		assert.equal(findProviderByDomain("gmail.com"), "gmail")
		assert.equal(findProviderByDomain("example.com"), null)
	})

	it("marks known email providers in ctx info", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "user@gmail.com" })
			await emailKnownProviderCheck(ctx)
			assert.equal(ctx.info.email_known_provider, "gmail")
			assert.ok("email_known_provider" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("marks disposable domains", async function () {
		const restore = withMeasuredPerformance()
		try {
			const check = createEmailDisposableCheck({
				getMembers: async () => ["mailinator.com"]
			})
			const ctx = createCtx({ email: "user@mailinator.com" })
			await check(ctx)
			assert.ok(ctx.threats.includes("email_disposable"))
			assert.ok("email_disposable" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("does not mark non-disposable domains", async function () {
		const check = createEmailDisposableCheck({
			getMembers: async () => ["mailinator.com"]
		})
		const ctx = createCtx({ email: "user@gmail.com" })
		await check(ctx)
		assert.ok(!ctx.threats.includes("email_disposable"))
	})

	it("flags separator abuse patterns", function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "j-o-h-n@example.com" })
			emailSeparatorCheck(ctx)
			assert.ok(ctx.threats.includes("email_local_sep_abuse"))
			assert.ok("email_local_sep_abuse" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("flags double separators", function () {
		const ctx = createCtx({ email: "john..doe@example.com" })
		emailSeparatorCheck(ctx)
		assert.ok(ctx.threats.includes("email_local_double_sep"))
	})

	it("flags dotted separator abuse patterns", function () {
		const ctx = createCtx({ email: "j.o.h.n@example.com" })
		emailSeparatorCheck(ctx)
		assert.ok(ctx.threats.includes("email_local_sep_abuse"))
	})

	it("records performance for double separators", function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "john..doe@example.com" })
			emailSeparatorCheck(ctx)
			assert.ok("email_local_double_sep" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("flags high separator count without requiring high density", function () {
		const ctx = createCtx({ email: "ab_cd_ef_gh_ij@example.com" })
		emailSeparatorCheck(ctx)
		assert.ok(ctx.threats.includes("email_local_sep_high_count"))
		assert.ok(!ctx.threats.includes("email_local_sep_high_density"))
	})

	it("records performance for high separator count", function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "ab_cd_ef_gh_ij@example.com" })
			emailSeparatorCheck(ctx)
			assert.ok("email_local_sep_high_density" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("flags high separator density", function () {
		const ctx = createCtx({ email: "a_b_c@example.com" })
		emailSeparatorCheck(ctx)
		assert.ok(ctx.threats.includes("email_local_sep_high_density"))
	})

	it("records performance for high separator density", function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "a_b_c@example.com" })
			emailSeparatorCheck(ctx)
			assert.ok("email_local_sep_high_density" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("does not flag ordinary separator usage", function () {
		const ctx = createCtx({ email: "john_doe@example.com" })
		emailSeparatorCheck(ctx)
		assert.ok(!ctx.threats.includes("email_local_sep_abuse"))
		assert.ok(!ctx.threats.includes("email_local_double_sep"))
		assert.ok(!ctx.threats.includes("email_local_sep_high_count"))
		assert.ok(!ctx.threats.includes("email_local_sep_high_density"))
	})

	it("flags role-based addresses", async function () {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "support@example.com" })
			await emailRoleCheck(ctx)
			assert.ok(ctx.threats.includes("email_local_generic_role"))
			assert.ok("email_local_generic_role" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("does not flag personal addresses as roles", async function () {
		const ctx = createCtx({ email: "alice@example.com" })
		await emailRoleCheck(ctx)
		assert.ok(!ctx.threats.includes("email_local_generic_role"))
	})
})
