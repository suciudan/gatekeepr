import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"
import { runInNewContext } from "node:vm"

// Resolve through Payload's actual dependency chain, rather than a separately
// installed esbuild. This guards the scoped security override in package.json.
const dashRequire = createRequire(new URL("../apps/dash/package.json", import.meta.url))
const payloadRequire = createRequire(dashRequire.resolve("@payloadcms/db-sqlite"))
const drizzleRequire = createRequire(payloadRequire.resolve("drizzle-kit/api"))
const loaderPath = drizzleRequire.resolve("@esbuild-kit/esm-loader")
const loaderRequire = createRequire(loaderPath)
const corePath = loaderRequire.resolve("@esbuild-kit/core-utils")
const { transform, transformSync } = loaderRequire("@esbuild-kit/core-utils")
const coreRequire = createRequire(corePath)

const source = 'const value: number = 42; export default { value }'

test("the legacy configuration loader resolves patched esbuild", () => {
	const [major, minor] = coreRequire("esbuild").version.split(".").map(Number)
	assert.ok(major > 0 || minor >= 25)
})

test("the loader synchronously transforms TypeScript configuration to CommonJS", () => {
	const output = transformSync(source, "/tmp/gatekeepr-config.cts")
	const module = { exports: {} }
	runInNewContext(output.code, { module, exports: module.exports })
	assert.equal(module.exports.default.value, 42)
	assert.ok(output.map)
})

test("the loader asynchronously transforms TypeScript configuration to ESM", async () => {
	const output = await transform(source, "/tmp/gatekeepr-config.mts")
	const config = await import(`data:text/javascript;base64,${Buffer.from(output.code).toString("base64")}`)
	assert.equal(config.default.value, 42)
	assert.ok(output.map)
})

test("the legacy ESM loader loads a TypeScript config with a relative import", () => {
	const directory = mkdtempSync(join(tmpdir(), "gatekeepr-loader-test-"))
	try {
		writeFileSync(join(directory, "package.json"), '{"type":"module"}')
		writeFileSync(join(directory, "value.ts"), 'export const value: number = 42')
		writeFileSync(join(directory, "config.ts"), 'import { value } from "./value.ts"; export default { value }')
		writeFileSync(join(directory, "entry.mjs"), 'import config from "./config.ts"; console.log(JSON.stringify(config))')
		const result = execFileSync(process.execPath, ["--no-warnings", "--loader", pathToFileURL(loaderPath).href, join(directory, "entry.mjs")], {
			encoding: "utf8",
			timeout: 15_000,
		})
		assert.equal(JSON.parse(result).value, 42)
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
})
