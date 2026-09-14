"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Search } from "lucide-react"

import { searchDisposableProviders } from "@/actions/disposableProviders"

function formatDate(value) {
	if(!value) return "Unknown"
	const parsed = new Date(value)
	if(Number.isNaN(parsed.getTime())) return "Unknown"
	return parsed.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric"
	})
}

export default function ProviderList({ initialResult }) {
	const [result, setResult] = useState(initialResult)
	const [query, setQuery] = useState(initialResult.query || "")
	const [minDomains, setMinDomains] = useState(initialResult.minDomains || "")
	const [isPending, startTransition] = useTransition()
	const hasFilters = Boolean(result.query || result.minDomains)

	function getProviderHref(provider) {
		return `/disposable-email-data/${provider.pathSlug || provider.slug}`
	}

	function loadProviders(nextQuery, nextMinDomains, nextPage = 1) {
		startTransition(async () => {
			const nextResult = await searchDisposableProviders({
				query: nextQuery,
				minDomains: nextMinDomains,
				page: nextPage
			})
			setResult(nextResult)
			setQuery(nextResult.query || "")
			setMinDomains(nextResult.minDomains || "")
		})
	}

	function onSubmit(event) {
		event.preventDefault()
		loadProviders(query, minDomains, 1)
	}

	function clearFilters() {
		loadProviders("", "", 1)
	}

	return (
		<>
			<form onSubmit={onSubmit} className="grid gap-3 border-b border-white/10 pb-4 lg:grid-cols-[minmax(0,1fr)_13rem]">
				<label className="relative block">
					<Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-500" />
					<span className="sr-only">Search providers</span>
					<input
						type="search"
						name="q"
						value={query}
						onChange={event => setQuery(event.target.value)}
						placeholder="Search provider, domain, host, or IP"
						className="h-12 w-full rounded-md border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm font-medium text-white outline-none transition placeholder:text-gray-400 focus:border-blue-400"
					/>
				</label>
				<label className="block">
					<span className="sr-only">Minimum domain count</span>
					<input
						type="number"
						name="minDomains"
						min="0"
						value={minDomains}
						onChange={event => setMinDomains(event.target.value)}
						placeholder="Min domains"
						className="h-12 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white outline-none transition placeholder:text-gray-400 focus:border-blue-400"
					/>
				</label>
				<button type="submit" disabled={isPending} className="sr-only">Apply provider filters</button>
			</form>

			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 py-4 text-sm text-gray-400">
				<p>
					Showing <span className="font-semibold text-white">{result.visibleProviderCount.toLocaleString("en-US")}</span> of{" "}
					<span className="font-semibold text-white">{result.totalMatchingProviders.toLocaleString("en-US")}</span> provider clusters
				</p>
				{hasFilters ? (
					<button
						type="button"
						onClick={clearFilters}
						disabled={isPending}
						className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-blue-400/40 hover:text-blue-200 disabled:cursor-wait disabled:opacity-60"
					>
						Clear filters
					</button>
				) : null}
			</div>

			{result.providers.length > 0 ? (
				<>
					<div className="divide-y divide-white/10 border-b border-white/10 opacity-100 transition-opacity data-[pending=true]:opacity-60" data-pending={isPending}>
						{result.providers.map((provider) => (
							<section key={provider.slug} className="grid gap-5 py-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
								<div>
									<div>
										<Link
											href={getProviderHref(provider)}
											className="break-all font-mono text-base font-semibold text-white hover:text-blue-300"
										>
											{provider.label}
										</Link>
									</div>
									<dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
										<div>
											<dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Domains</dt>
											<dd className="mt-1 font-semibold text-gray-200">
												{provider.domainCount.toLocaleString("en-US")}
											</dd>
										</div>
										<div>
											<dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Latest Seen</dt>
											<dd className="mt-1 text-gray-300">
												{formatDate(provider.lastSeenAt || provider.lastEnrichedAt)}
											</dd>
										</div>
									</dl>
								</div>

								<div>
									<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
										Domains routed through this MX host
									</h2>
									<div className="mt-3 flex flex-wrap gap-2">
										{provider.domains.map((domain) => (
											<span
												key={domain.domain}
												className="max-w-full break-all rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs text-gray-200"
											>
												{domain.domain}
											</span>
										))}
										{provider.remainingDomains > 0 ? (
											<Link
												href={getProviderHref(provider)}
												className="rounded-md border border-blue-400/30 bg-blue-400/10 px-2.5 py-1.5 text-xs font-semibold text-blue-200 hover:border-blue-300 hover:text-blue-100"
											>
												+{provider.remainingDomains.toLocaleString("en-US")} more
											</Link>
										) : null}
									</div>
								</div>
							</section>
						))}
					</div>

					{result.totalPages > 1 ? (
						<nav className="mt-8 flex items-center justify-between gap-4 text-sm font-semibold">
							{result.page > 1 ? (
								<button
									type="button"
									onClick={() => loadProviders(result.query, result.minDomains, result.page - 1)}
									disabled={isPending}
									className="rounded-lg border border-white/10 px-4 py-2 text-gray-200 hover:border-blue-500 hover:text-blue-300 disabled:cursor-wait disabled:opacity-60"
								>
									Previous
								</button>
							) : (
								<span className="rounded-lg border border-white/10 px-4 py-2 text-gray-600">Previous</span>
							)}
							<span className="text-gray-400">
								Page {result.page.toLocaleString("en-US")} of {result.totalPages.toLocaleString("en-US")}
							</span>
							{result.page < result.totalPages ? (
								<button
									type="button"
									onClick={() => loadProviders(result.query, result.minDomains, result.page + 1)}
									disabled={isPending}
									className="rounded-lg border border-white/10 px-4 py-2 text-gray-200 hover:border-blue-500 hover:text-blue-300 disabled:cursor-wait disabled:opacity-60"
								>
									Next
								</button>
							) : (
								<span className="rounded-lg border border-white/10 px-4 py-2 text-gray-600">Next</span>
							)}
						</nav>
					) : null}
				</>
			) : (
				<div className="border-y border-white/10 py-12">
					<h2 className="text-2xl font-semibold text-white">No MX host groups available</h2>
					<p className="mt-4 max-w-3xl text-base/7 text-gray-300">
						{hasFilters
							? "No provider groups match the current filters. Clear the search or lower the minimum domain count."
							: "The directory is backed by Gatekeepr's disposable-domain profile cache. Run the disposable refresh, MX enrichment, and MX IP refresh jobs to populate MX host groups."}
					</p>
				</div>
			)}
		</>
	)
}
