import { measurePerformance } from "@repo/core/performance"
import redis from "@repo/core/redis"

export const createEmailDisposableCheck = ({
	getMembers = (key) => redis.smembers(key)
} = {}) => {
	return async function emailDisposableCheck(ctx) {
		const { email } = ctx.payload

		let start

		if(measurePerformance()) start = performance.now()

		const host = email.split("@")[1]
		const disposableEmails = new Set(await getMembers("disposable_emails"))

		if(disposableEmails.has(host)) {
			ctx.threats.push("email_disposable")
		}

		if(measurePerformance()) ctx.performance.email_disposable = performance.now() - start
	}
}

export const emailDisposableCheck = createEmailDisposableCheck()
