import { measurePerformance } from "@repo/core/performance"
import { isIPv6InCidrs } from "@repo/core/ipv6"
import { isIPv4InCidrs } from "@repo/core/ipv4"

export const createSpamhausDropCheck = ({
	isIPv4InCidrsFn = isIPv4InCidrs,
	isIPv6InCidrsFn = isIPv6InCidrs
} = {}) => {
	return async function spamhausDropCheck(ctx) {
		const ipType = ctx?.info.ipv4 ? "ipv4" : ctx?.info.ipv6 ? "ipv6" : false
		if(!ipType) return

		const { ip } = ctx.payload

		if(!ip) return
		if(ctx.info.ip_private) return

		let found = false
		let start
		if(measurePerformance()) start = performance.now()

		if(ipType === "ipv4") {
			found = await isIPv4InCidrsFn(`spamhaus_${ipType}`, ip)
		} else {
			found = await isIPv6InCidrsFn(`spamhaus_${ipType}`, ip)
		}

		if(found) {
			ctx.threats.push("ip_blocklist_spamhaus_drop")
			ctx.blocklists.push({
				name: "Spamhaus DROP",
				url: "https://www.spamhaus.org/blocklists/do-not-route-or-peer"
			})
			if(measurePerformance()) ctx.performance.ip_blocklist_spamhaus_drop = performance.now() - start
		}
	}
}

export const spamhausDropCheck = createSpamhausDropCheck()
