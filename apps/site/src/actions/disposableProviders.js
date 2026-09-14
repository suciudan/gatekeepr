"use server"

import { getDisposableProviderPage } from "@/libs/disposable-providers"
import { selectProviderListPage } from "@/libs/disposable-provider-list-page"

export async function searchDisposableProviders({
	query = "",
	minDomains = "",
	page = 1
} = {}) {
	const providerPage = await getDisposableProviderPage(page, {
		query,
		minDomainCount: minDomains
	})

	return selectProviderListPage(providerPage, {
		query,
		minDomains
	})
}
