import redis, { jsonGet } from "@repo/core/redis"
import {
	DISPOSABLE_EMAILS_KEY,
	extractDisposableLookupDomain,
	getDisposableProfileKey,
	resolveDisposableLookupState
} from "@repo/core/disposable-domains"

export async function lookupDisposableDomainInput(input) {
	const domain = extractDisposableLookupDomain(input)
	if(!domain) return resolveDisposableLookupState(input)

	const [isDisposable, profile] = await Promise.all([
		redis.sismember(DISPOSABLE_EMAILS_KEY, domain),
		jsonGet(getDisposableProfileKey(domain))
	])

	return resolveDisposableLookupState(input, {
		isDisposable: isDisposable === 1 || isDisposable === "1",
		profile
	})
}
