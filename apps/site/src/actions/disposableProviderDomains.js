"use server"

import { getDisposableProviderBySlug } from "@/libs/disposable-providers"
import { selectProviderDomainPage } from "@/libs/disposable-provider-domain-page"

export async function searchDisposableProviderDomains({
	slug,
	query = "",
	page = 1
} = {}) {
	const provider = await getDisposableProviderBySlug(slug)
	if(!provider) {
		return {
			error: "Provider not found",
			domains: [],
			page: 1,
			query: "",
			totalDomains: 0,
			totalMatchingDomains: 0,
			totalPages: 1,
			visibleDomainCount: 0
		}
	}

	return selectProviderDomainPage(provider, {
		query,
		page
	})
}
