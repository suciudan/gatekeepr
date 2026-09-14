import { measurePerformance } from "@repo/core/performance"
import logger from "@repo/core/logger"

const certificateErrors = [
	"ERR_TLS_CERT_ALTNAME_INVALID",
	"ERR_CERT_COMMON_NAME_INVALID",
	"ERR_CERT_AUTHORITY_INVALID",
	"ERR_CERT_DATE_INVALID",
	"ERR_CERT_REVOKED",
	"ERR_CERT_WEAK_SIGNATURE_ALGORITHM",
	"ERR_SSL_PROTOCOL_ERROR",
	"ERR_SSL_VERSION_OR_CIPHER_MISMATCH",
	"ERR_TLS_HANDSHAKE_TIMEOUT",
	"ERR_TLS_INVALID_PROTOCOL_VERSION",
	"ERR_TLS_DH_PARAM_SIZE"
]

export const createDomainHttpsCheck = ({
	fetchImpl = fetch,
	loggerFn = logger,
	abortControllerFactory = () => new AbortController(),
	setTimeoutFn = setTimeout,
	clearTimeoutFn = clearTimeout
} = {}) => {
	return async function domainHttpsCheck(ctx) {
		if(ctx.info.email_known_provider) return

		let start

		if(measurePerformance()) start = performance.now()

		const { email } = ctx.payload
		const domain = email.split("@")[1]

		const controller = abortControllerFactory()
		const timeout = setTimeoutFn(() => controller.abort(), 1000)

		try {
			await fetchImpl(`https://${domain}`, {
				method: "HEAD",
				signal: controller.signal,
			})

			if(timeout) clearTimeoutFn(timeout)
		} catch(error) {
			if(timeout) clearTimeoutFn(timeout)
			if(certificateErrors.includes(error?.cause?.code)) {
				ctx.threats.push("domain_no_https")
				ctx.performance.domain_no_https = performance.now() - start
			} else {
				await loggerFn(`https-check: ${error?.message} (${error?.cause?.code}) for ${email}`, process.env.SLACK_ERRORS_API)
			}
		}
	}
}

export const domainHttpsCheck = createDomainHttpsCheck()
