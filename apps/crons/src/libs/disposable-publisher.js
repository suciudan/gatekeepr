import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
	createDisposablePackageArtifacts
} from "@repo/core/disposable-domains"

import {
	listDisposableDomains,
	loadDisposableProfiles
} from "./disposable-emails.js"

export function runCommand(command, args, {
	cwd,
	env = process.env
} = {}) {
	const secrets = [env.DISPOSABLE_PUBLISH_GITHUB_TOKEN, env.DISPOSABLE_PUBLISH_NPM_TOKEN, env.NODE_AUTH_TOKEN]
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

function ensureList(values, requiredValues) {
	const nextValues = Array.isArray(values) ? [...values] : []
	for(const value of requiredValues) {
		if(nextValues.includes(value)) continue
		nextValues.push(value)
	}
	return nextValues
}

function bumpPatchVersion(version = "0.0.0") {
	const [major = "0", minor = "0", patch = "0"] = String(version).split(".")
	return `${major}.${minor}.${parseInt(patch || "0", 10) + 1}`
}

function buildDisposableIndexSource() {
	return `import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const domainsList = require("./disposable.json")
const domainsExtendedList = require("./disposable-extended.json")
const disposableSet = new Set(domainsList)

function normalizeDisposableInput(value = "") {
\tif(typeof value !== "string") return ""
\tconst normalized = value.trim().toLowerCase()
\tif(!normalized) return ""
\tconst atIndex = normalized.lastIndexOf("@")
\treturn atIndex === -1 ? normalized : normalized.slice(atIndex + 1)
}

export default function isDisposable(value = "") {
\tconst domain = normalizeDisposableInput(value)
\treturn domain ? disposableSet.has(domain) : false
}

export { domainsList, domainsExtendedList }
`
}

function buildDisposableReadme() {
	return `# Email Disposable

A regularly updated list of disposable and temporary email domains, ideal for validating user sign-ups, preventing spam,
and filtering fake accounts.

## Installation

\`\`\`shell
npm install email-disposable
\`\`\`

## Usage

Check if an email is disposable:

\`\`\`javascript
import isDisposable from "email-disposable"

console.log(isDisposable("john@mailinator.com")) // true
console.log(isDisposable("john@gmail.com")) // false
\`\`\`

Get the flat domain list:

\`\`\`javascript
import { domainsList } from "email-disposable"

console.log(domainsList.length)
\`\`\`

Get the enriched dataset:

\`\`\`javascript
import { domainsExtendedList } from "email-disposable"

console.log(domainsExtendedList["mailinator.com"])
console.log(domainsExtendedList["mailinator.com"].mxResolvedRecords)
\`\`\`

## Files

- \`disposable.json\`: flat JSON array of disposable domains
- \`disposable.txt\`: flat newline-delimited domain list
- \`disposable-extended.json\`: keyed JSON map with enrichment details per domain, including MX hostnames and the latest resolved MX IP snapshot

## About

**email-disposable** is maintained by [Gatekeepr](https://gatekeepr.io), a privacy-first API that blocks
fake users and platform abuse by analyzing emails, IPs, domains, and user agents in real time.
`
}

function shapePackageJson(packageJson, version) {
	return {
		...packageJson,
		name: packageJson?.name || "email-disposable",
		version,
		type: "module",
		main: "index.js",
		files: ensureList(packageJson?.files, [
			"index.js",
			"README.md",
			"disposable.json",
			"disposable.txt",
			"disposable-extended.json"
		])
	}
}

function createFallbackProfile(domain) {
	return {
		domain,
		isDisposable: true,
		firstSeenAt: null,
		lastSeenAt: null,
		lastEnrichedAt: null,
		creation: null,
		expiration: null,
		owner: null,
		status: [],
		mxRecords: [],
		mxResolvedAt: null,
		mxResolvedRecords: []
	}
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

async function writePackageFiles(cwd, {
	artifacts,
	packageJsonVersion
} = {}) {
	const packageJsonPath = path.join(cwd, "package.json")
	const currentPackageJson = await readPackageJson(packageJsonPath)

	await fs.writeFile(path.join(cwd, "disposable.json"), artifacts.disposableJson, "utf8")
	await fs.writeFile(path.join(cwd, "disposable.txt"), artifacts.disposableTxt, "utf8")
	await fs.writeFile(path.join(cwd, "disposable-extended.json"), artifacts.disposableExtendedJson, "utf8")
	await fs.writeFile(path.join(cwd, "index.js"), buildDisposableIndexSource(), "utf8")
	await fs.writeFile(path.join(cwd, "README.md"), buildDisposableReadme(), "utf8")
	await fs.writeFile(
		packageJsonPath,
		`${JSON.stringify(shapePackageJson(currentPackageJson, packageJsonVersion), null, 2)}\n`,
		"utf8"
	)

	return currentPackageJson
}

async function readPackageJson(packageJsonPath) {
	try {
		return JSON.parse(await fs.readFile(packageJsonPath, "utf8"))
	} catch {
		return {}
	}
}

export async function loadDisposablePackageArtifacts(redisClient) {
	const domains = await listDisposableDomains()
	const profilesByDomain = await loadDisposableProfiles(redisClient, domains)
	const profiles = domains.map(domain => profilesByDomain.get(domain) || createFallbackProfile(domain))
	return createDisposablePackageArtifacts(profiles)
}

export async function publishDisposableDomains({
	artifacts,
	dryRun = false,
	loggerFn = null,
	env = process.env
} = {}) {
	const repository = env.DISPOSABLE_PUBLISH_REPO || "gtkppr/email-disposable"
	const branch = env.DISPOSABLE_PUBLISH_BRANCH || "main"
	const githubToken = env.DISPOSABLE_PUBLISH_GITHUB_TOKEN || null
	const npmToken = env.DISPOSABLE_PUBLISH_NPM_TOKEN || null
	const gitName = env.DISPOSABLE_PUBLISH_GIT_NAME || "Gatekeepr Bot"
	const gitEmail = env.DISPOSABLE_PUBLISH_GIT_EMAIL || "hello@gatekeepr.io"
	const enabled = env.DISPOSABLE_PUBLISH_ENABLED === "true"

	if(!enabled && !dryRun) {
		return { status: "skipped", reason: "publishing_disabled" }
	}
	if(!artifacts) throw new Error("No disposable-domain artifacts are available to publish.")

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gatekeepr-disposable-"))
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
			artifacts,
			packageJsonVersion: existingPackageJson?.version || "0.0.0"
		})
		if(!await hasRepoChanges(tempDir)) {
			return { status: "skipped", reason: "no_changes" }
		}

		const nextVersion = bumpPatchVersion(currentPackageJson?.version || "0.0.0")
		await writePackageFiles(tempDir, {
			artifacts,
			packageJsonVersion: nextVersion
		})

		if(dryRun) {
			await runNpmCommand(["pack", "--dry-run"], { cwd: tempDir })
			return { status: "dry_run", version: nextVersion }
		}

		if(!githubToken || !npmToken) {
			return { status: "skipped", reason: "missing_publish_credentials" }
		}

		await runCommand("git", ["config", "user.name", gitName], { cwd: tempDir })
		await runCommand("git", ["config", "user.email", gitEmail], { cwd: tempDir })
		await runCommand("git", ["add", "."], { cwd: tempDir })
		await runCommand("git", ["commit", "-m", `update package ${nextVersion}`], { cwd: tempDir })
		await runCommand("git", ["tag", `v${nextVersion}`], { cwd: tempDir })
		await runCommand("git", ["push", "origin", branch, "--tags"], { cwd: tempDir })

		await fs.writeFile(
			path.join(tempDir, ".npmrc"),
			"//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n",
			"utf8"
		)
		await runNpmCommand(["publish", "--access", "public"], {
			cwd: tempDir,
			env: {
				...process.env,
				...env,
				NODE_AUTH_TOKEN: npmToken
			}
		})

		if(loggerFn) {
			await loggerFn(`disposable-publish: published ${repository}@${nextVersion}`, env.SLACK_STATUS_CRON)
		}

		return { status: "published", version: nextVersion }
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true })
	}
}
