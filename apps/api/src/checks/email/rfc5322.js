import { measurePerformance } from "@repo/core/performance"

const rule =
	// local-part
	"^(?:[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+" +
	"(?:\\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*" +
	// or quoted-string
	"|" +
	'"(?:[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x21\\x23-\\x5b\\x5d-\\x7f]|' +
	'\\\\[\\x01-\\x09\\x0b\\x0c\\x0e-\\x7f])*"' +
	")" +
	// @
	"@" +
	// domain: either dot-separated labels...
	"(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+" +
	"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?" +
	// ...or literal IP in brackets
	"|\\[(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\.){3}" +
	"(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)" +
	"\\])$"

export const emailRfc5322Check = async (ctx) => {
	
	const { email } = ctx.payload
	
	const emailRegex = new RegExp(rule)
	const isValid = emailRegex.test(email)
	
	let start
	
	if(measurePerformance()) start = performance.now()
	
	if(!isValid) {
		ctx.threats.push(`email_fails_rfc5322`)
		if(measurePerformance()) ctx.performance.email_fails_rfc5322 = performance.now() - start
		ctx.halt = true
	} else {
		ctx.trust.push("email_passes_rfc5322")
		if(measurePerformance()) ctx.performance.email_passes_rfc5322 = performance.now() - start
	}
	
}