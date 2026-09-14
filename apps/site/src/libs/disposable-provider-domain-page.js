export const DISPOSABLE_PROVIDER_DOMAIN_PAGE_SIZE = 100

export function getSearchParamValue(value) {
	if(Array.isArray(value)) return value[0] || ""
	return typeof value === "string" ? value : ""
}

function domainMatchesQuery(domain, query) {
	if(!query) return true

	return [
		domain.domain,
		...(domain.mxHosts || []),
		...(domain.mxIpv4 || []),
		...(domain.mxIpv6 || [])
	]
		.filter(Boolean)
		.some(value => value.toLowerCase().includes(query))
}

export function selectProviderDomainPage(provider, {
	query = "",
	page = 1
} = {}) {
	const normalizedQuery = typeof query === "string" ? query.trim().toLowerCase() : ""
	const currentPage = Math.max(1, Math.floor(Number(page) || 1))
	const domains = Array.isArray(provider?.domains) ? provider.domains : []
	const matchingDomains = domains.filter(domain => domainMatchesQuery(domain, normalizedQuery))
	const totalMatchingDomains = matchingDomains.length
	const totalDomainPages = Math.max(1, Math.ceil(totalMatchingDomains / DISPOSABLE_PROVIDER_DOMAIN_PAGE_SIZE))
	const safeDomainPage = Math.min(currentPage, totalDomainPages)
	const domainStart = (safeDomainPage - 1) * DISPOSABLE_PROVIDER_DOMAIN_PAGE_SIZE
	const visibleDomains = matchingDomains.slice(domainStart, domainStart + DISPOSABLE_PROVIDER_DOMAIN_PAGE_SIZE)
	const visibleDomainCount = Math.min(
		totalMatchingDomains,
		safeDomainPage * DISPOSABLE_PROVIDER_DOMAIN_PAGE_SIZE
	)

	return {
		domains: visibleDomains,
		page: safeDomainPage,
		query: normalizedQuery,
		totalDomains: domains.length,
		totalMatchingDomains,
		totalPages: totalDomainPages,
		visibleDomainCount
	}
}
