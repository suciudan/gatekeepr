import assert from "node:assert"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"

import { readConf } from "../src/libs/conf.js"
import { shannonEntropy } from "../src/libs/entropy.js"
import checks from "../src/libs/checks.js"
import { createCtx } from "./helpers.js"

describe("support libraries", function () {
	it("reads conf files line by line", async function () {
		const file = path.join(os.tmpdir(), `gatekeepr-conf-${Date.now()}.txt`)
		await fs.writeFile(file, "one\r\ntwo", "utf8")

		try {
			const result = await readConf(file)
			assert.deepEqual(result, ["one", "two"])
		} finally {
			await fs.unlink(file)
		}
	})

	it("returns zero entropy for empty strings", function () {
		assert.equal(shannonEntropy(""), 0)
	})

	it("returns higher entropy for more varied strings", function () {
		assert.ok(shannonEntropy("abcd1234") > shannonEntropy("aaaaaaaa"))
	})

	it("exposes a no-op root email check", async function () {
		const ctx = createCtx()
		await checks.emailCheck.fn(ctx)
		assert.deepEqual(ctx.threats, [])
		assert.deepEqual(ctx.trust, [])
	})
})
