import { measurePerformance } from "@repo/core/performance"
import { isIPv4InCidrs } from "@repo/core/ipv4"

export const createIpTorCheck = ({
	isIPv4InCidrsFn = isIPv4InCidrs
} = {}) => {
	return async function ipTorCheck(ctx) {
		const { ip } = ctx.payload

		if(!ip) return
		if(ctx.info.ip_private) return

		let start
		if(measurePerformance()) start = performance.now()

		if(await isIPv4InCidrsFn("tor_exit_nodes", ip)) {
			ctx.threats.push("ip_tor_exit_node")
			if(measurePerformance()) ctx.performance.ip_tor_exit_node = performance.now() - start
		}
	}
}

export const ipTorCheck = createIpTorCheck()
