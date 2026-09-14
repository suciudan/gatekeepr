import { DISPOSABLE_PROVIDER_PAGE_SIZE } from "@/libs/disposable-providers"

export const DISPOSABLE_PROVIDER_DOMAIN_PREVIEW_LIMIT = 10

export function getSearchParamValue(value) {
	if(Array.isArray(value)) return value[0] || ""
	return typeof value === "string" ? value : ""
}

export function selectProviderListPage(providerPage, {
	query = "",
	minDomains = ""
} = {}) {
	const normalizedQuery = typeof query === "string" ? query.trim() : ""
	const normalizedMinDomains = typeof minDomains === "string" ? minDomains.trim() : ""
	const visibleProviderCount = Math.min(
		providerPage.totalMatchingProviders,
		providerPage.page * DISPOSABLE_PROVIDER_PAGE_SIZE
	)

	return {
		page: providerPage.page,
		providers: providerPage.providers.map(provider => ({
			slug: provider.slug,
			pathSlug: provider.pathSlug,
			label: provider.label,
			domainCount: provider.domainCount,
			lastSeenAt: provider.lastSeenAt,
			lastEnrichedAt: provider.lastEnrichedAt,
			domains: provider.domains
				.slice(0, DISPOSABLE_PROVIDER_DOMAIN_PREVIEW_LIMIT)
				.map(domain => ({
					domain: domain.domain
				})),
			remainingDomains: Math.max(0, provider.domainCount - DISPOSABLE_PROVIDER_DOMAIN_PREVIEW_LIMIT)
		})),
		query: normalizedQuery,
		minDomains: normalizedMinDomains,
		totalMatchingProviders: providerPage.totalMatchingProviders,
		totalPages: providerPage.totalPages,
		totalProviders: providerPage.totalProviders,
		visibleProviderCount
	}
}
