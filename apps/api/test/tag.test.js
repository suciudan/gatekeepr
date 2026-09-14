import assert from "node:assert"

import { emailSuspiciousTagCheck } from "../src/checks/email/tag.js"
import { createCtx, withMeasuredPerformance } from "./helpers.js"

describe("email suspicious tag check", function () {
	it("flags any plus alias as suspicious", function () {
		const restore = withMeasuredPerformance()
		const ctx = createCtx({ email: "user+promo@gmail.com" })
		emailSuspiciousTagCheck(ctx)
		assert.ok(ctx.threats.includes("email_suspicious_tag"))
		assert.ok("email_suspicious_tag" in ctx.performance)
		restore()
	})

	it("does not treat hyphenated local parts as tags", function () {
		const ctx = createCtx({ email: "john-doe@gmail.com" })
		emailSuspiciousTagCheck(ctx)
		assert.ok(!ctx.threats.includes("email_suspicious_tag"))
	})

	it("does not treat equals signs as tags", function () {
		const ctx = createCtx({ email: "user=test@gmail.com" })
		emailSuspiciousTagCheck(ctx)
		assert.ok(!ctx.threats.includes("email_suspicious_tag"))
	})
})
