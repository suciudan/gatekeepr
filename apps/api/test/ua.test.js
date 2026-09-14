import assert from "node:assert"

import {
	createBrowserVersionsDataset,
	parseOperaDesktopIndex,
	parseSafariReleaseNotes,
	parseSamsungReleaseNotes
} from "@repo/core/browser-versions"

import { createNotBrowserCheck } from "../src/checks/ua/notBrowser.js"
import {
	assessBrowserVersion,
	createBrowserVersionCheck,
	parseBrowserUserAgent
} from "../src/checks/ua/browserVersion.js"
import { createCtx, withMeasuredPerformance } from "./helpers.js"

describe("user-agent checks", function () {
	it("ignores empty user agents", async function () {
		const check = createNotBrowserCheck()
		const ctx = createCtx({ user_agent: null })
		await check(ctx)
		assert.deepEqual(ctx.threats, [])
	})

	it("flags known scraper user agents", async function () {
		const restore = withMeasuredPerformance()
		try {
			const check = createNotBrowserCheck()
			const ctx = createCtx({ user_agent: "curl/8.0" })
			await check(ctx)
			assert.ok(ctx.threats.includes("ua_is_scraper"))
			assert.ok("ua_is_scraper" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("does not flag browser user agents", async function () {
		const restore = withMeasuredPerformance()
		try {
			const check = createNotBrowserCheck()
			const ctx = createCtx({ user_agent: "Mozilla/5.0" })
			await check(ctx)
			assert.ok(!ctx.threats.includes("ua_is_scraper"))
			assert.ok("ua_not_scraper" in ctx.performance)
		} finally {
			restore()
		}
	})

	it("parses major browser user agents", function () {
		assert.deepEqual(parseBrowserUserAgent("Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36"), {
			key: "chrome",
			name: "Chrome",
			version: "140.0.0.0",
			major: 140,
			legacy: false,
			productVersion: null,
			engine: null
		})
		assert.equal(parseBrowserUserAgent("Mozilla/5.0 Firefox/139.0")?.key, "firefox")
		assert.equal(parseBrowserUserAgent("Mozilla/5.0 Edg/140.0.0.0")?.key, "edge")
		assert.equal(parseBrowserUserAgent("Mozilla/5.0 Version/18.5 Safari/605.1.15")?.key, "safari")
		assert.equal(parseBrowserUserAgent("Mozilla/5.0 Trident/7.0; rv:11.0")?.legacy, true)
	})

	it("recognizes Chromium-derived top browsers explicitly", function () {
		const samsung = parseBrowserUserAgent("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/136.0.0.0 Mobile Safari/537.36")
		assert.equal(samsung.name, "Samsung Internet")
		assert.equal(samsung.key, "chrome")
		assert.equal(samsung.version, "136.0.0.0")
		assert.equal(samsung.productVersion, "28.0")
		assert.equal(samsung.engine, "Chromium")

		const opera = parseBrowserUserAgent("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 OPR/121.0.0.0")
		assert.equal(opera.name, "Opera")
		assert.equal(opera.key, "chrome")
		assert.equal(opera.version, "136.0.0.0")
		assert.equal(opera.productVersion, "121.0.0.0")
		assert.equal(opera.engine, "Chromium")

		const yandex = parseBrowserUserAgent("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.4.0.0 Safari/537.36")
		assert.equal(yandex.name, "Yandex Browser")
		assert.equal(yandex.key, "chrome")
		assert.equal(yandex.version, "136.0.0.0")
		assert.equal(yandex.productVersion, "25.4.0.0")
		assert.equal(yandex.engine, "Chromium")
	})

	it("does not misclassify UC Browser as Safari", function () {
		const uc = parseBrowserUserAgent("Mozilla/5.0 (Linux; U; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 UCBrowser/15.5.0.1311 Mobile Safari/537.36")
		assert.equal(uc.name, "UC Browser")
		assert.equal(uc.key, "uc")
		assert.equal(uc.version, "15.5.0.1311")
	})

	it("parses browser-version upstream pages", function () {
		assert.equal(parseSafariReleaseNotes(`
			Safari 26.5 Beta Release Notes
			Released March 30, 2026 — 26.5 beta
			Safari 26.4 Release Notes
			Released March 24, 2026 — 26.4
		`), "26.4")
		assert.equal(parseSamsungReleaseNotes(`
			Samsung Browser for Windows 30.0.0.97 New Apr 13, 2026
			Samsung Internet for Android 25.0.0.41 New May 11, 2024
		`), "30.0.0.97")
		assert.equal(parseOperaDesktopIndex(`
			<a href="127.0.5778.76/">127.0.5778.76/</a>
			<a href="128.0.5807.52/">128.0.5807.52/</a>
		`), "128.0.5807.52")
	})

	it("assesses current, outdated, unsupported, future, and ESR browser versions", function () {
		const dataset = createBrowserVersionsDataset({
			chrome: { latestVersion: "140.0.0.0" },
			firefox: { latestVersion: "140.0", supportedEsrMajors: [128] }
		}, {
			generatedAt: "2026-04-30T00:00:00.000Z"
		})

		assert.equal(assessBrowserVersion(parseBrowserUserAgent("Chrome/139.0.0.0"), dataset, {
			now: "2026-04-30T00:00:00.000Z"
		}).threat, null)
		assert.equal(assessBrowserVersion(parseBrowserUserAgent("Chrome/137.0.0.0"), dataset, {
			now: "2026-04-30T00:00:00.000Z"
		}).threat, "ua_browser_outdated")
		assert.equal(assessBrowserVersion(parseBrowserUserAgent("Chrome/134.0.0.0"), dataset, {
			now: "2026-04-30T00:00:00.000Z"
		}).threat, "ua_browser_unsupported")
		assert.equal(assessBrowserVersion(parseBrowserUserAgent("Chrome/143.0.0.0"), dataset, {
			now: "2026-04-30T00:00:00.000Z"
		}).threat, "ua_browser_version_suspicious")
		assert.equal(assessBrowserVersion(parseBrowserUserAgent("Firefox/128.0"), dataset, {
			now: "2026-04-30T00:00:00.000Z"
		}).threat, null)
	})

	it("fails open when browser version data is stale", function () {
		const dataset = createBrowserVersionsDataset({
			chrome: { latestVersion: "140.0.0.0" }
		}, {
			generatedAt: "2026-01-01T00:00:00.000Z"
		})
		const assessment = assessBrowserVersion(parseBrowserUserAgent("Chrome/120.0.0.0"), dataset, {
			now: "2026-04-30T00:00:00.000Z"
		})
		assert.equal(assessment, null)
	})

	it("adds browser version threat and response metadata", async function () {
		const restore = withMeasuredPerformance()
		try {
			const dataset = createBrowserVersionsDataset({
				chrome: { latestVersion: "140.0.0.0" }
			}, {
				generatedAt: "2026-04-30T00:00:00.000Z"
			})
			const check = createBrowserVersionCheck({
				loadBrowserVersionsFn: async () => dataset,
				nowFactory: () => new Date("2026-04-30T00:00:00.000Z")
			})
			const ctx = createCtx({
				user_agent: "Mozilla/5.0 Chrome/137.0.0.0 Safari/537.36"
			})

			await check(ctx)

			assert.ok(ctx.threats.includes("ua_browser_outdated"))
			assert.equal(ctx.info.browser_name, "Chrome")
			assert.equal(ctx.info.browser_major, 137)
			assert.equal(ctx.info.browser_latest_major, 140)
			assert.equal(ctx.info.browser_major_lag, 3)
			assert.ok("ua_browser_outdated" in ctx.performance)
		} finally {
			restore()
		}
	})

})
