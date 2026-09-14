import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"

import {
	publishBrowserVersions,
	runCommand as runBrowserCommand
} from "../../crons/src/libs/browser-version-publisher.js"
import {
	publishDisposableDomains,
	runCommand as runDisposableCommand
} from "../../crons/src/libs/disposable-publisher.js"
import {
	runCommand as runInfrastructureCommand
} from "../../crons/src/libs/disposable-infrastructure-publisher.js"

const publishers = [
	{
		name: "browser versions",
		publish: publishBrowserVersions,
		runCommand: runBrowserCommand,
		flag: "BROWSER_VERSIONS_PUBLISH_ENABLED",
		missingData: /No browser-version dataset/
	},
	{
		name: "disposable domains",
		publish: publishDisposableDomains,
		runCommand: runDisposableCommand,
		flag: "DISPOSABLE_PUBLISH_ENABLED",
		missingData: /No disposable-domain artifacts/
	}
]

for(const { name, publish, flag, missingData } of publishers) {
	describe(`${name} publisher safety`, function () {
		it("skips before doing work unless publishing is explicitly enabled", async function () {
			for(const value of [undefined, "false", "", "TRUE", "1", true]) {
				const env = value === undefined ? {} : { [flag]: value }
				assert.deepEqual(await publish({ env }), {
					status: "skipped", reason: "publishing_disabled"
				})
			}
		})

		it("validates required data before cloning when explicitly enabled", async function () {
			await assert.rejects(publish({ env: { [flag]: "true" } }), missingData)
		})

		it("allows an explicit dry run to reach validation while publishing is disabled", async function () {
			for(const env of [{}, { [flag]: "false" }]) {
				await assert.rejects(publish({ dryRun: true, env }), missingData)
			}
		})
	})
}

const commandRunners = [
	...publishers,
	{ name: "disposable infrastructure", runCommand: runInfrastructureCommand }
]
for(const { name, runCommand } of commandRunners) {
	describe(`${name} publisher command safety`, function () {
		it("redacts clone credentials from command failure details", async function () {
			const token = "synthetic-publisher-credential"
			const cloneUrl = `https://x-access-token:${token}@github.com/example/dataset.git`
			const script = "console.log(process.argv[1]); console.error(process.argv[1]); process.exit(1)"
			await assert.rejects(
				runCommand(process.execPath, ["-e", script, cloneUrl]),
				error => {
					assert.match(error.message, /failed with exit code 1/)
					assert.match(error.stderr, /github\.com\/example\/dataset\.git/)
					for(const value of [error.message, error.stack, error.stdout, error.stderr, JSON.stringify(error)]) {
						assert.equal(value.includes(token), false)
						assert.equal(value.includes(cloneUrl), false)
					}
					return true
				}
			)
		})

		it("does not attach credential-bearing arguments when a command cannot start", async function () {
			const token = "synthetic-startup-credential"
			await assert.rejects(
				runCommand(path.join(os.tmpdir(), "gatekeepr-missing-publisher-command"), [
					`https://x-access-token:${token}@github.com/example/dataset.git`
				]),
				error => {
					assert.match(error.message, /failed to start/)
					assert.equal(error.message.includes(token), false)
					assert.equal(JSON.stringify(error).includes(token), false)
					assert.equal(error.spawnargs, undefined)
					return true
				}
			)
		})
	})
}
