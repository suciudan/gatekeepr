"use client"

import { useState, useTransition } from "react"
import { Search } from "lucide-react"

import { searchDisposableProviderDomains } from "@/actions/disposableProviderDomains"

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

function formatList(values = [], fallback = "None captured") {
	if(!Array.isArray(values) || values.length === 0) return fallback
	return values.join(", ")
}

export default function ProviderDomains({
	initialResult,
	providerSlug
}) {
	const [result, setResult] = useState(initialResult)
	const [query, setQuery] = useState(initialResult.query || "")
	const [isPending, startTransition] = useTransition()
	const hasDomainFilters = Boolean(result.query)

	function loadDomains(nextQuery, nextPage = 1) {
		startTransition(async () => {
			const nextResult = await searchDisposableProviderDomains({
				slug: providerSlug,
				query: nextQuery,
				page: nextPage
			})
			setResult(nextResult)
			setQuery(nextResult.query || "")
		})
	}

	function onSubmit(event) {
		event.preventDefault()
		loadDomains(query, 1)
	}

	function clearSearch() {
		loadDomains("", 1)
	}

	return (
		<div>
			<div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="text-2xl font-semibold text-white">Associated Domains</h2>
					<p className="mt-2 text-sm text-gray-400">
						Showing {result.visibleDomainCount.toLocaleString("en-US")} of{" "}
						{result.totalMatchingDomains.toLocaleString("en-US")} {hasDomainFilters ? "matching " : ""}
						{result.totalMatchingDomains === 1 ? "domain" : "domains"}.
					</p>
				</div>
			</div>
			<form onSubmit={onSubmit} className="mb-5 grid gap-3 border-b border-white/10 pb-4 sm:grid-cols-[minmax(0,1fr)_auto]">
				<label className="relative block">
					<Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-500" />
					<span className="sr-only">Search associated domains</span>
					<input
						type="search"
						name="q"
						value={query}
						onChange={event => setQuery(event.target.value)}
						placeholder="Search domain, MX host, or IP"
						className="h-12 w-full rounded-md border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm font-medium text-white outline-none transition placeholder:text-gray-400 focus:border-blue-400"
					/>
				</label>
				<button
					type="submit"
					disabled={isPending}
					className="h-12 rounded-md border border-blue-400/30 bg-blue-400/10 px-4 text-sm font-semibold text-blue-200 hover:border-blue-300 hover:text-blue-100 disabled:cursor-wait disabled:opacity-60"
				>
					Search
				</button>
			</form>
			{hasDomainFilters ? (
				<div className="mb-5 flex justify-end">
					<button
						type="button"
						onClick={clearSearch}
						disabled={isPending}
						className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-blue-400/40 hover:text-blue-200 disabled:cursor-wait disabled:opacity-60"
					>
						Clear search
					</button>
				</div>
			) : null}
			<div className="overflow-x-auto border-y border-white/10">
				{result.domains.length > 0 ? (
					<table className="min-w-full divide-y divide-white/10 text-left text-sm">
						<thead className="bg-white/[0.03] text-xs uppercase tracking-[0.18em] text-gray-500">
							<tr>
								<th scope="col" className="py-4 pl-4 pr-6 font-semibold sm:pl-6">Domain</th>
								<th scope="col" className="px-6 py-4 font-semibold">Added</th>
								<th scope="col" className="px-6 py-4 font-semibold">MX Hostnames</th>
								<th scope="col" className="py-4 pl-6 pr-4 font-semibold sm:pr-6">MX IPs</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-white/10 opacity-100 transition-opacity data-[pending=true]:opacity-60" data-pending={isPending}>
							{result.domains.map((domain) => (
								<tr key={domain.domain} className="align-top">
									<td className="whitespace-nowrap py-5 pl-4 pr-6 font-semibold text-white sm:pl-6">
										{domain.domain}
									</td>
									<td className="whitespace-nowrap px-6 py-5 text-gray-300">
										{formatDate(domain.firstSeenAt)}
									</td>
									<td className="max-w-md px-6 py-5 text-gray-300">
										{formatList(domain.mxHosts)}
									</td>
									<td className="max-w-md py-5 pl-6 pr-4 text-gray-300 sm:pr-6">
										{formatList([...domain.mxIpv4, ...domain.mxIpv6])}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<div className="px-4 py-12 sm:px-6">
						<h3 className="text-lg font-semibold text-white">No domains found</h3>
						<p className="mt-2 text-sm text-gray-400">
							No associated domains match the current search.
						</p>
					</div>
				)}
			</div>
			{result.totalPages > 1 ? (
				<nav className="mt-6 flex items-center justify-between gap-4 text-sm font-semibold">
					{result.page > 1 ? (
						<button
							type="button"
							onClick={() => loadDomains(result.query, result.page - 1)}
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
							onClick={() => loadDomains(result.query, result.page + 1)}
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
		</div>
	)
}
