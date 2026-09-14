import Header from "@/components/Header"
import Footer from "@/components/Footer"
import { getDisposableProviderPage } from "@/libs/disposable-providers"
import {
	getSearchParamValue,
	selectProviderListPage
} from "@/libs/disposable-provider-list-page"
import ProviderList from "./ProviderList"

export const revalidate = 3600

export const metadata = {
	title: "Disposable Email Data | Gatekeepr",
	description: "Daily-refreshed disposable email domains, MX records, IPs, and provider clusters.",
	alternates: {
		canonical: "/disposable-email-data",
	},
}

export default async function DisposableProvidersPage({ searchParams }) {
	const resolvedSearchParams = await searchParams
	const pageNumber = getSearchParamValue(resolvedSearchParams?.page)
	const query = getSearchParamValue(resolvedSearchParams?.q).trim()
	const minDomains = getSearchParamValue(resolvedSearchParams?.minDomains).trim()
	const providerPage = await getDisposableProviderPage(pageNumber, {
		query,
		minDomainCount: minDomains
	})
	const initialProviderResult = selectProviderListPage(providerPage, {
		query,
		minDomains
	})

	return (
		<div className="min-h-screen bg-gray-950 text-white">
			<Header />
			<main className="pb-20">
				<section className="border-b border-white/5 bg-[linear-gradient(180deg,#081120_0%,#050c18_56%,#030712_100%)] pt-20 sm:pt-24">
					<div className="mx-auto max-w-7xl px-6 pb-14 sm:pb-16 lg:px-8">
						<div className="max-w-5xl py-8 sm:py-12">
							<h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
								Disposable Email Data
							</h1>
							<p className="mt-7 max-w-4xl text-lg/8 font-medium text-gray-300 sm:text-xl/9">
								Daily-refreshed disposable email domains, MX records, IPs, and provider clusters.
							</p>
							<p className="mt-4 max-w-4xl text-sm/6 font-medium text-gray-400">
								The data is available for free on{" "}
								<a
									href="https://github.com/gtkppr/disposable-email-infrastructure"
									className="font-semibold text-blue-400 hover:text-blue-300"
									rel="noopener noreferrer"
									target="_blank"
								>
									GitHub
								</a>.
							</p>
						</div>
					</div>
				</section>

				<section className="mx-auto max-w-7xl px-6 pt-10 lg:px-8">
					<ProviderList initialResult={initialProviderResult} />
				</section>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
