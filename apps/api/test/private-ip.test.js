import assert from "node:assert/strict"

import { isPrivateIP } from "@repo/core/ip"

describe("private IP classification", function () {
	it("recognizes local ranges and IPv4-mapped IPv6 consistently", function () {
		for(const address of [
			"10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",
			"127.0.0.1", "169.254.1.1", "::1", "::", "fc00::1", "fdff::1",
			"fe80::1", "febf::1", "::ffff:127.0.0.1", "::ffff:7f00:1",
			"::ffff:192.168.1.1", "::ffff:c0a8:101", "0:0:0:0:0:0:0:1"
		]) {
			assert.equal(isPrivateIP(address), true, address)
		}
	})

	it("preserves public and documentation range classification", function () {
		for(const address of [
			"8.8.8.8", "172.15.255.255", "172.32.0.0", "192.169.0.1",
			"203.0.113.10", "2001:db8::1", "2001:4860:4860::8888",
			"::ffff:8.8.8.8", "::ffff:808:808", "fec0::1"
		]) {
			assert.equal(isPrivateIP(address), false, address)
		}
	})

	it("does not throw or accept malformed and nonstandard IP representations", function () {
		for(const address of [
			"", "not-an-ip", "999.1.2.3", "127.1", "0177.0.0.1",
			"0x7f000001", "2130706433", "127.0.0.1.evil.example", null, undefined, 123
		]) {
			assert.equal(isPrivateIP(address), false, String(address))
		}
	})
})
