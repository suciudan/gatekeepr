import assert from "node:assert/strict"

import { selectRemovedDisposableSourceDomains } from "../../crons/src/libs/disposable-emails.js"

describe("disposable email cron helpers", function () {
	it("keeps MX-discovered disposable domains active when upstream sources omit them", function () {
		const removedDomains = selectRemovedDisposableSourceDomains(
			["listed.test", "discovered.test", "removed.test"],
			["listed.test"],
			new Map([
				["listed.test", { domain: "listed.test", source: "source" }],
				["discovered.test", { domain: "discovered.test", source: "mx_disposable_infrastructure" }],
				["removed.test", { domain: "removed.test", source: "source" }]
			])
		)

		assert.deepEqual(removedDomains, ["removed.test"])
	})
})
