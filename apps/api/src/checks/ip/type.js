import isIP from "validator/lib/isIP.js"

import { measurePerformance } from "@repo/core/performance"
import { isPrivateIP } from "@repo/core/ip"

export const ipTypeCheck = async (ctx) => {
	
	const { ip } = ctx.payload
	
	if(!ip) return
	
	let start
	if(measurePerformance()) start = performance.now()
	
	if(isPrivateIP(ip)) {
		ctx.info.ip_private = true
		if(measurePerformance()) ctx.performance.ipCheck = performance.now() - start
		return
	}
	
	if(isIP(ip, { version: 4 })) {
		ctx.info.ipv4 = true
		if(measurePerformance()) ctx.performance.ipCheck = performance.now() - start
	} else if(isIP(ip, { version: 6 })) {
		ctx.info.ipv6 = true
		if(measurePerformance()) ctx.performance.ipCheck = performance.now() - start
	}
	
}