import { measurePerformance } from "@repo/core/performance"
import { isIPv4InCidrs } from "@repo/core/ipv4"

export const createBlocklistUaCheck = ({
	isIPv4InCidrsFn = isIPv4InCidrs
} = {}) => {
	return async function blocklistUaCheck(ctx) {
		if(ctx?.info.ipv6) return

		const { ip } = ctx.payload

		if(!ip) return
		if(ctx.info.ip_private) return

		let start

		if(measurePerformance()) start = performance.now()

		if(await isIPv4InCidrsFn("blocklist_ua", ip)) {
			ctx.threats.push("ip_blocklist_net_ua")
			ctx.blocklists.push({
				name: "BlockList.net.ua",
				url: "https://blocklist.net.ua"
			})
			ctx.performance.ip_blocklist_net_ua = performance.now() - start
		}
	}
}

export const blocklistUaCheck = createBlocklistUaCheck()
