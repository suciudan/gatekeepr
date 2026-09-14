import isIP from "validator/lib/isIP.js"

import { measurePerformance } from "@repo/core/performance"

export const ipValidCheck = (ctx) => {
	
	const { ip } = ctx.payload
	
	if(!ip) return
	
	let start
	if(measurePerformance()) start = performance.now()
	
	const isValid = isIP(ip)
	
	if(isValid === false) {
		ctx.threats.push("ip_invalid")
		if(measurePerformance()) ctx.performance.ip_invalid = performance.now() - start
	}
	
}