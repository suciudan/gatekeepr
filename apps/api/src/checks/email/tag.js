import { measurePerformance } from "@repo/core/performance"

export const emailSuspiciousTagCheck = (ctx) => {
	
	const { email } = ctx.payload
	
	let start
	
	if(measurePerformance()) start = performance.now()
	
	const localPart = email.split("@")[0]
	
	if(localPart.includes("+") === false) return
	
	ctx.threats.push("email_suspicious_tag")
	if(measurePerformance()) ctx.performance.email_suspicious_tag = performance.now() - start
	
}
