import { measurePerformance } from "@repo/core/performance"

import { EMAIL_SEP_DENSITY_THRESHOLD, EMAIL_SEP_MAX_COUNT, EMAIL_SEPARATORS } from "../../config/constants.js"

const separatorCheck = (localPart, separator) => {
	const escapedSeparator = separator.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
	const collapsedLocal = localPart.replace(new RegExp(escapedSeparator, "g"), "")
	const expectedPattern = collapsedLocal.split("").join(separator)
	return (localPart === expectedPattern && collapsedLocal.length > 1)
}

export const emailSeparatorCheck = (ctx) => {
	
	const { email } = ctx.payload
	
	const localPart = email.split("@")[0]
	
	let start
	if(measurePerformance()) start = performance.now()
	
	if(
		separatorCheck(localPart, ".") === true ||
		separatorCheck(localPart, "-")
	) {
		ctx.threats.push("email_local_sep_abuse")
		if(measurePerformance()) ctx.performance.email_local_sep_abuse = performance.now() - start
		return
	}
	
	const consecutiveSep = /(--|__|\.\.)/
	
	if(consecutiveSep.test(localPart)) {
		ctx.threats.push("email_local_double_sep")
		if(measurePerformance()) ctx.performance.email_local_double_sep = performance.now() - start
		return
	}
	
	let sepCount = 0
	
	for(const char of localPart) {
		if(EMAIL_SEPARATORS.includes(char)) {
			sepCount++
		}
	}
	
	if(sepCount >= EMAIL_SEP_MAX_COUNT) {
		ctx.threats.push("email_local_sep_high_count")
		if(measurePerformance()) ctx.performance.email_local_sep_high_density = performance.now() - start
	}
	
	const sepRatio = sepCount / localPart.length
	
	if(sepRatio > EMAIL_SEP_DENSITY_THRESHOLD) {
		ctx.threats.push("email_local_sep_high_density")
		if(measurePerformance()) ctx.performance.email_local_sep_high_density = performance.now() - start
	}
	
}