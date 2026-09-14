import isFQDN from "validator/lib/isFQDN.js"

import { measurePerformance } from "@repo/core/performance"

export const domainValidCheck = async (ctx) => {
	
	// Skip this verification for known email providers
	if(ctx.info.email_known_provider) return
	
	let start
	
	if(measurePerformance()) start = performance.now()
	
	const { email } = ctx.payload

	const parts = email.split("@")
	
	if(!parts[1]) {
		ctx.threats.push("domain_missing")
		ctx.halt = true
		if(measurePerformance()) ctx.performance.domain_missing = performance.now() - start
		return
	}
	
	const domain = parts[1]
	
	const isValid = isFQDN(domain)
	
	if(!isValid) {
		ctx.threats.push("domain_invalid")
		ctx.halt = true
		if(measurePerformance()) ctx.performance.domain_invalid = performance.now() - start
	} else {
		ctx.trust.push("domain_valid")
		if(measurePerformance()) ctx.performance.domain_valid = performance.now() - start
	}
	
}
