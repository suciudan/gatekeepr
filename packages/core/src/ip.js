import { isIP } from "node:net"
import ipaddr from "ipaddr.js"

const privateRanges = new Set(["private", "loopback", "linkLocal", "uniqueLocal"])

export const isPrivateIP = (ipAddress) => {
	// Reject ambiguous octal/hex/short IPv4 forms, as the API's validator does.
	if(typeof ipAddress !== "string" || !isIP(ipAddress)) return false

	const address = ipaddr.process(ipAddress)
	return privateRanges.has(address.range())
		|| (address.kind() === "ipv6" && address.range() === "unspecified")
}
