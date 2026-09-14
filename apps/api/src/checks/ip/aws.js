import { measurePerformance } from "@repo/core/performance"
import { isIPv4InCidrs } from "@repo/core/ipv4"
import { isIPv6InCidrs } from "@repo/core/ipv6"

export const createIpAwsCheck = ({
	isIPv4InCidrsFn = isIPv4InCidrs,
	isIPv6InCidrsFn = isIPv6InCidrs
} = {}) => {
	return async function ipAwsCheck(ctx) {
		const { ip } = ctx.payload

		if(!ip) return
		if(ctx.info.ip_private) return

		let found = false
		let start

		if(measurePerformance()) start = performance.now()

		if(ctx.info.ipv4) {
			found = await isIPv4InCidrsFn("aws_ipv4", ip)
		}
		if(ctx.info.ipv6) {
			found = await isIPv6InCidrsFn("aws_ipv6", ip)
		}

		if(found) {
			ctx.threats.push("ip_aws")
			if(measurePerformance()) ctx.performance.ip_aws = performance.now() - start
		}
	}
}

export const ipAwsCheck = createIpAwsCheck()
