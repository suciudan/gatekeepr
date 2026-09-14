import assert from "node:assert"

import { emailCompositionCheck } from "../src/checks/email/composition.js"
import { createCtx, withMeasuredPerformance } from "./helpers.js"

describe("email composition check", function () {
	
	it("a@gmail.com should trigger email_local_too_short", async () => {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "a@gmail.com" })
			await emailCompositionCheck(ctx)
			assert.ok(ctx.threats.includes("email_local_too_short"))
		} finally {
			restore()
		}
	})
	
	it("pneumonoultramicroscopicsilicovolcanoconiosis@gmail.com should trigger email_local_too_long", async () => {
		const ctx = createCtx({ email: "pneumonoultramicroscopicsilicovolcanoconiosis@gmail.com" })
		await emailCompositionCheck(ctx)
		assert.ok(ctx.threats.includes("email_local_too_long"))
	})
	
	it("123456@gmail.com should trigger email_local_digits_only", async () => {
		const ctx = createCtx({ email: "123456@gmail.com" })
		await emailCompositionCheck(ctx)
		assert.ok(ctx.threats.includes("email_local_digits_only"))
	})
	
	it("abcd1234@gmail.com should trigger email_local_high_digit_ratio", async () => {
		const ctx = createCtx({ email: "abcd1234@gmail.com" })
		await emailCompositionCheck(ctx)
		assert.ok(ctx.threats.includes("email_local_high_digit_ratio"))
	})
	
	it("abcd123@gmail.com shouldn't trigger email_local_high_digit_ratio", async () => {
		const ctx = createCtx({ email: "abcd123@gmail.com" })
		await emailCompositionCheck(ctx)
		assert.ok(!ctx.threats.includes("email_local_high_digit_ratio"))
	})
	
	it("aaaa12345bbbb@gmail.com should trigger email_local_consec_digits5", async () => {
		const ctx = createCtx({ email: "aaaa12345bbbb@gmail.com" })
		await emailCompositionCheck(ctx)
		assert.ok(ctx.threats.includes("email_local_consec_digits5"))
	})
	
	it("bcdfgh@gmail.com should trigger email_local_lacks_vowels", async () => {
		const ctx = createCtx({ email: "bcdfgh@gmail.com" })
		await emailCompositionCheck(ctx)
		assert.ok(ctx.threats.includes("email_local_lacks_vowels"))
	})
	
	it("a1b2c3d4e5f6g7h8@gmail.com should trigger email_local_high_entropy", async () => {
		const ctx = createCtx({ email: "a1b2c3d4e5f6g7h8@gmail.com" })
		await emailCompositionCheck(ctx)
		assert.ok(ctx.threats.includes("email_local_high_entropy"))
	})

	it("aaaaab@gmail.com should trigger email_local_repeated_chars", async () => {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "aaaaab@gmail.com" })
			await emailCompositionCheck(ctx)
			assert.ok(ctx.threats.includes("email_local_repeated_chars"))
			assert.ok("email_local_repeated_chars" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("ab\u0432\u0433\u0434@gmail.com should trigger email_local_mixed_scripts", async () => {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "ab\u0432\u0433\u0434@gmail.com" })
			await emailCompositionCheck(ctx)
			assert.ok(ctx.threats.includes("email_local_mixed_scripts"))
			assert.ok("email_local_mixed_scripts" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("alice😀@gmail.com should trigger email_local_emoji", async () => {
		const restore = withMeasuredPerformance()
		try {
			const ctx = createCtx({ email: "alice😀@gmail.com" })
			await emailCompositionCheck(ctx)
			assert.ok(ctx.threats.includes("email_local_emoji"))
			assert.ok("email_local_emoji" in ctx.performance)
		} finally {
			restore()
		}
	})
})
