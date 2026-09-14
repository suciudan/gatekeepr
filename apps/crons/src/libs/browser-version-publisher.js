import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
	createBrowserVersionsPackageArtifacts
} from "@repo/browser-versions"
export function runCommand(command, args, {
	cwd,
	env = process.env
} = {}) {
	const secrets = [env.BROWSER_VERSIONS_PUBLISH_GITHUB_TOKEN, env.NODE_AUTH_TOKEN]
	for(const argument of args) {
		try {
			const url = new URL(argument)
			if(url.password) secrets.push(url.password, decodeURIComponent(url.password))
		} catch {}
	}
	const redact = value => {
		let output = String(value)
		for(const secret of secrets.filter(Boolean)) output = output.replaceAll(secret, "[REDACTED]")
		return output.replace(/(https?:\/\/)[^\s/@]+@/gi, "$1[REDACTED]@")
	}
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: "pipe"
		})
		let stdout = ""
		let stderr = ""

		child.stdout.on("data", chunk => {
			stdout += String(chunk)
		})
		child.stderr.on("data", chunk => {
			stderr += String(chunk)
		})
		child.on("error", error => {
			reject(new Error(`${command} failed to start (${error.code || "unknown error"})`))
		})
		child.on("close", code => {
			if(code === 0) {
				resolve({
					stdout: redact(stdout.trim()),
					stderr: redact(stderr.trim())
				})
				return
			}
			const error = new Error(`${command} failed with exit code ${code}`)
			error.stdout = redact(stdout.trim())
			error.stderr = redact(stderr.trim())
			reject(error)
		})
	})
}

function runNpmCommand(args, options) {
	if(process.platform === "win32") {
		return runCommand("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], options)
	}
	return runCommand("npm", args, options)
}

function bumpPatchVersion(version = "0.0.0") {
	const [major = "0", minor = "0", patch = "0"] = String(version).split(".")
	return `${major}.${minor}.${parseInt(patch || "0", 10) + 1}`
}

function buildCloneUrl(repository, token) {
	const cleanedRepository = repository
		.replace(/^https:\/\/github\.com\//, "")
		.replace(/\.git$/, "")
	if(!token) return `https://github.com/${cleanedRepository}.git`
	return `https://x-access-token:${token}@github.com/${cleanedRepository}.git`
}

async function hasRepoChanges(cwd) {
	const result = await runCommand("git", ["status", "--short"], { cwd })
	return result.stdout.length > 0
}

async function readPackageJson(packageJsonPath) {
	try {
		return JSON.parse(await fs.readFile(packageJsonPath, "utf8"))
	} catch {
		return {}
	}
}

async function writePackageFiles(cwd, {
	dataset,
	packageJsonVersion,
	env = process.env
} = {}) {
	const packageJsonPath = path.join(cwd, "package.json")
	const currentPackageJson = await readPackageJson(packageJsonPath)
	const artifacts = createBrowserVersionsPackageArtifacts(dataset, {
		packageJson: currentPackageJson,
		version: packageJsonVersion,
		packageName: env.BROWSER_VERSIONS_PACKAGE_NAME,
		repository: env.BROWSER_VERSIONS_PUBLISH_REPO
	})

	await fs.writeFile(path.join(cwd, "browser-versions.json"), artifacts.browserVersionsJson, "utf8")
	await fs.writeFile(path.join(cwd, "browser-versions.min.json"), artifacts.browserVersionsMinJson, "utf8")
	await fs.writeFile(path.join(cwd, "browser-versions.txt"), artifacts.browserVersionsTxt, "utf8")
	await fs.writeFile(path.join(cwd, "index.js"), artifacts.indexJs, "utf8")
	await fs.writeFile(path.join(cwd, "README.md"), artifacts.readme, "utf8")
	await fs.writeFile(packageJsonPath, artifacts.packageJson, "utf8")

	return currentPackageJson
}

export async function loadBrowserVersionDataset(redisClient) {
	const { loadBrowserVersions } = await import("@repo/core/browser-versions")
	const dataset = await loadBrowserVersions({ redisClient })
	if(!dataset) throw new Error("No browser-version dataset is available to publish.")
	return dataset
}

export async function publishBrowserVersions({
	dataset,
	dryRun = false,
	loggerFn = null,
	env = process.env
} = {}) {
	const repository = env.BROWSER_VERSIONS_PUBLISH_REPO || "gtkppr/browser-versions"
	const branch = env.BROWSER_VERSIONS_PUBLISH_BRANCH || "main"
	const githubToken = env.BROWSER_VERSIONS_PUBLISH_GITHUB_TOKEN || null
	const gitName = env.BROWSER_VERSIONS_PUBLISH_GIT_NAME || "Gatekeepr Bot"
	const gitEmail = env.BROWSER_VERSIONS_PUBLISH_GIT_EMAIL || "hello@gatekeepr.io"
	const enabled = env.BROWSER_VERSIONS_PUBLISH_ENABLED === "true"

	if(!enabled && !dryRun) {
		return { status: "skipped", reason: "publishing_disabled" }
	}
	if(!dataset) throw new Error("No browser-version dataset is available to publish.")

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gatekeepr-browser-versions-"))
	try {
		await runCommand("git", [
			"clone",
			"--depth",
			"1",
			"--branch",
			branch,
			buildCloneUrl(repository, githubToken),
			tempDir
		])

		const packageJsonPath = path.join(tempDir, "package.json")
		const existingPackageJson = await readPackageJson(packageJsonPath)
		const currentPackageJson = await writePackageFiles(tempDir, {
			dataset,
			packageJsonVersion: existingPackageJson?.version || "0.0.0",
			env
		})
		if(!await hasRepoChanges(tempDir)) {
			return { status: "skipped", reason: "no_changes" }
		}

		const nextVersion = bumpPatchVersion(currentPackageJson?.version || "0.0.0")
		await writePackageFiles(tempDir, {
			dataset,
			packageJsonVersion: nextVersion,
			env
		})

		if(dryRun) {
			await runNpmCommand(["pack", "--dry-run"], { cwd: tempDir })
			return { status: "dry_run", version: nextVersion }
		}

		if(!githubToken) {
			return { status: "skipped", reason: "missing_publish_credentials" }
		}

		await runCommand("git", ["config", "user.name", gitName], { cwd: tempDir })
		await runCommand("git", ["config", "user.email", gitEmail], { cwd: tempDir })
		await runCommand("git", ["add", "."], { cwd: tempDir })
		await runCommand("git", ["commit", "-m", `update browser versions ${nextVersion}`], { cwd: tempDir })
		await runCommand("git", ["tag", `v${nextVersion}`], { cwd: tempDir })
		await runCommand("git", ["push", "origin", branch, "--tags"], { cwd: tempDir })

		if(loggerFn) {
			await loggerFn(`browser-versions-publish: published ${repository}@${nextVersion}`, env.SLACK_STATUS_CRON)
		}

		return { status: "published", version: nextVersion }
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true })
	}
}
