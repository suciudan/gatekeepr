import assert from "node:assert"

import { createBrowserVersionsDataset } from "@repo/core/browser-versions"

import {
	createBrowserVersionsPackageArtifacts,
	createBrowserVersionsTxt,
	shapeBrowserVersionsPackageJson
} from "../src/index.js"

describe("browser-version package artifacts", function () {
	it("creates JSON, text, package, index, and README artifacts", function () {
		const dataset = createBrowserVersionsDataset({
			chrome: { latestVersion: "140.0.0.0" },
			firefox: { latestVersion: "139.0", supportedEsrMajors: [128] }
		}, {
			generatedAt: "2026-04-30T00:00:00.000Z"
		})
		const artifacts = createBrowserVersionsPackageArtifacts(dataset, {
			packageJson: { version: "1.2.3" },
			version: "1.2.4"
		})

		assert.ok(artifacts.browserVersionsJson.includes("\"schemaVersion\""))
		assert.ok(artifacts.browserVersionsMinJson.startsWith("{"))
		assert.equal(artifacts.browserVersionsTxt, "chrome\tChrome\t140.0.0.0\t140\tchrome-versionhistory\thttps://versionhistory.googleapis.com/v1/chrome/platforms/all/channels/stable/versions\t\t\tmajor-version-lag-heuristic\nfirefox\tFirefox\t139.0\t139\tmozilla-product-details\thttps://product-details.mozilla.org/1.0/firefox_versions.json\t\t\tmajor-version-lag-heuristic\n")
		assert.ok(artifacts.indexJs.includes("getCurrentBrowserVersion"))
		assert.ok(artifacts.readme.includes("browser-versions.txt"))
		assert.ok(artifacts.readme.includes("npm install github:gtkppr/browser-versions"))

		const browserVersions = JSON.parse(artifacts.browserVersionsJson)
		assert.equal(browserVersions.schemaVersion, 2)
		assert.equal(browserVersions.browsers.chrome.currentVersion, "140.0.0.0")
		assert.equal(browserVersions.browsers.chrome.sources.currentVersion.sourceUrl, "https://versionhistory.googleapis.com/v1/chrome/platforms/all/channels/stable/versions")
		assert.equal(browserVersions.browsers.chrome.sources.eol, null)
		assert.equal(browserVersions.policy.eolSource, null)
		assert.equal(browserVersions.policy.assessment.type, "major-version-lag-heuristic")
		assert.match(browserVersions.policy.assessment.description, /not vendor EOL data/)

		const packageJson = JSON.parse(artifacts.packageJson)
		assert.equal(packageJson.name, "@gatekeepr/browser-versions")
		assert.equal(packageJson.version, "1.2.4")
		assert.equal(packageJson.repository.url, "git+https://github.com/gtkppr/browser-versions.git")
		assert.equal(packageJson.exports["./browser-versions.txt"], "./browser-versions.txt")
	})

	it("creates an empty text file for empty datasets", function () {
		assert.equal(createBrowserVersionsTxt({ browsers: {} }), "")
	})

	it("preserves existing package metadata while ensuring required fields", function () {
		const packageJson = shapeBrowserVersionsPackageJson({
			description: "Existing description",
			files: ["LICENSE"]
		}, {
			version: "2.0.0"
		})

		assert.equal(packageJson.description, "Existing description")
		assert.equal(packageJson.version, "2.0.0")
		assert.ok(packageJson.files.includes("LICENSE"))
		assert.ok(packageJson.files.includes("browser-versions.json"))
	})
})
