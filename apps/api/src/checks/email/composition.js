import emojiRegex from "emoji-regex"

import { measurePerformance } from "@repo/core/performance"

import { shannonEntropy } from "../../libs/entropy.js"
import {
	EMAIL_DIGITS_RATIO,
	EMAIL_LOCAL_ENTROPY,
	EMAIL_MAX_REPEAT_CHARS
} from "../../config/constants.js"

const regex = emojiRegex()

const hasRepeatedChars = (localPart) => {
	const counts = {}
	for(const c of localPart) {
		counts[c] = (counts[c] || 0) + 1
		if(counts[c] >= EMAIL_MAX_REPEAT_CHARS) {
			return true
		}
	}
	return false
}

const hasMixedScripts = (localPart) => {
	const hasLatin = /[A-Za-z]/.test(localPart)
	const hasCyrillic = /[\u0400-\u04FF]/.test(localPart)
	const hasGreek = /[\u0370-\u03FF]/.test(localPart)
	return hasLatin && (hasCyrillic || hasGreek)
}

export const emailCompositionCheck = async (ctx) => {

	const { email } = ctx.payload
	
	const localPart = email.split("@")[0]
	const len = localPart.length
	const digitCount = (localPart.match(/\d/g) || []).length
	
	let start
	
	if(measurePerformance()) start = performance.now()
	
	if(len < 2) {
		ctx.threats.push("email_local_too_short")
		if(measurePerformance()) ctx.performance.email_local_too_short = performance.now() - start
	} else if(len > 30) {
		ctx.threats.push("email_local_too_long")
		if(measurePerformance()) ctx.performance.email_local_too_long = performance.now() - start
	}
	
	if(/^[0-9]+$/.test(localPart)) {
		ctx.threats.push("email_local_digits_only")
		if(measurePerformance()) ctx.performance.email_local_digits_only = performance.now() - start
	} else if(digitCount / len >= EMAIL_DIGITS_RATIO) {
		ctx.threats.push("email_local_high_digit_ratio")
		if(measurePerformance()) ctx.performance.email_local_high_digit_ratio = performance.now() - start
	} else if(/\d{5,}/.test(localPart)) {
		ctx.threats.push("email_local_consec_digits5")
		if(measurePerformance()) ctx.performance.email_local_consec_digits5 = performance.now() - start
	} else if(!(/[aeiou]/i.test(localPart))) {
		ctx.threats.push("email_local_lacks_vowels")
		if(measurePerformance()) ctx.performance.email_local_lacks_vowels = performance.now() - start
	}
	
	if(shannonEntropy(localPart) >= EMAIL_LOCAL_ENTROPY) {
		ctx.threats.push("email_local_high_entropy")
		if(measurePerformance()) ctx.performance.email_local_high_entropy = performance.now() - start
	}
	
	if(hasRepeatedChars(localPart)) {
		ctx.threats.push("email_local_repeated_chars")
		if(measurePerformance()) ctx.performance.email_local_repeated_chars = performance.now() - start
	}
	
	if(hasMixedScripts(localPart)) {
		ctx.threats.push("email_local_mixed_scripts")
		if(measurePerformance()) ctx.performance.email_local_mixed_scripts = performance.now() - start
	}
	
	if(regex.test(localPart)) {
		ctx.threats.push("email_local_emoji")
		if(measurePerformance()) ctx.performance.email_local_emoji = performance.now() - start
	}

}