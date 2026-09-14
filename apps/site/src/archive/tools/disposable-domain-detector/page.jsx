import Header from "@/components/Header"
import Footer from "@/components/Footer"
import { lookupDisposableDomainInput } from "@/libs/disposable-domain-detector"

export const metadata = {
	title: "Disposable Domain Detector | Gatekeepr",
	description: "Check whether a domain is currently treated as disposable and inspect its registration and MX context.",
	alternates: {
		canonical: "/tools/disposable-domain-detector",
	},
}

function formatDate(value) {
	if(!value) return "Unknown"
	const parsed = new Date(value)
	if(Number.isNaN(parsed.getTime())) return value
	return parsed.toLocaleString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric"
	})
}

function formatStatuses(statuses = []) {
	return statuses.length ? statuses.join(", ") : "None"
}

function formatMxRecords(mxRecords = []) {
	if(!mxRecords.length) return "No MX records captured"
	return mxRecords.map(record => `${record.exchange} (${record.priority})`).join(", ")
}

function formatMxResolvedRecords(mxResolvedRecords = []) {
	if(!mxResolvedRecords.length) return "No MX host IP snapshot captured"
	return mxResolvedRecords.map(record => {
		const ipSummary = [
			record.ipv4?.length ? `A ${record.ipv4.join(", ")}` : null,
			record.ipv6?.length ? `AAAA ${record.ipv6.join(", ")}` : null
		].filter(Boolean).join(" | ")
		return `${record.exchange} (${record.priority}): ${ipSummary || "no IPs resolved"}`
	}).join("; ")
}

function ResultCard({ result }) {
	if(!result) return null

	if(result.state === "invalid") {
		return (
			<div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
				<p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-300">Invalid Input</p>
				<h2 className="mt-3 text-2xl font-semibold text-white">Enter an email address or domain</h2>
				<p className="mt-4 text-base/7 text-gray-300">
					The detector accepts a full email like <code className="text-white">user@mailinator.com</code> or a
					bare domain like <code className="text-white">mailinator.com</code>.
				</p>
			</div>
		)
	}

	if(result.state === "not_disposable") {
		return (
			<div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
				<p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">Not Listed</p>
				<h2 className="mt-3 text-2xl font-semibold text-white">{result.domain}</h2>
				<p className="mt-4 text-base/7 text-gray-300">
					This domain is not currently present in Gatekeepr&apos;s maintained disposable-domain list.
				</p>
			</div>
		)
	}

	if(result.state === "disposable_pending") {
		return (
			<div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
				<p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-300">Disposable Domain</p>
				<h2 className="mt-3 text-2xl font-semibold text-white">{result.domain}</h2>
				<p className="mt-4 text-base/7 text-gray-300">
					This domain is currently flagged as disposable. The extended WHOIS/RDAP enrichment has not been
					captured yet or is queued for refresh.
				</p>
			</div>
		)
	}

	return (
		<div className="rounded-3xl border border-red-500/30 bg-white/5 p-6">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-300">Disposable Domain</p>
					<h2 className="mt-3 text-2xl font-semibold text-white">{result.domain}</h2>
				</div>
				<p className="text-sm text-gray-400">Last enriched: {formatDate(result.profile?.lastEnrichedAt)}</p>
			</div>
			<div className="mt-8 grid gap-4 md:grid-cols-2">
				<div className="rounded-2xl border border-white/10 bg-gray-950/50 p-4">
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">First Seen</p>
					<p className="mt-2 text-base font-semibold text-white">{formatDate(result.profile?.firstSeenAt)}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-gray-950/50 p-4">
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Last Seen</p>
					<p className="mt-2 text-base font-semibold text-white">{formatDate(result.profile?.lastSeenAt)}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-gray-950/50 p-4">
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Created</p>
					<p className="mt-2 text-base font-semibold text-white">{formatDate(result.profile?.creation)}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-gray-950/50 p-4">
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Expires</p>
					<p className="mt-2 text-base font-semibold text-white">{formatDate(result.profile?.expiration)}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-gray-950/50 p-4 md:col-span-2">
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Owner</p>
					<p className="mt-2 text-base font-semibold text-white">{result.profile?.owner || "Unknown"}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-gray-950/50 p-4 md:col-span-2">
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Statuses</p>
					<p className="mt-2 text-base font-semibold text-white">{formatStatuses(result.profile?.status)}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-gray-950/50 p-4 md:col-span-2">
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">MX Records</p>
					<p className="mt-2 text-base font-semibold text-white">{formatMxRecords(result.profile?.mxRecords)}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-gray-950/50 p-4 md:col-span-2">
					<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
						<p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">MX Host IP Snapshot</p>
						<p className="text-xs text-gray-500">Resolved: {formatDate(result.profile?.mxResolvedAt)}</p>
					</div>
					<p className="mt-2 text-base font-semibold text-white">
						{formatMxResolvedRecords(result.profile?.mxResolvedRecords)}
					</p>
				</div>
			</div>
		</div>
	)
}

export default async function DisposableDomainDetectorPage({ searchParams }) {
	const resolvedSearchParams = await searchParams
	const query = typeof resolvedSearchParams?.q === "string" ? resolvedSearchParams.q : ""
	const result = query ? await lookupDisposableDomainInput(query) : null

	return (
		<div className="bg-gray-950 text-white">
			<Header />
			<main className="px-6 pb-20 pt-32 lg:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="max-w-3xl">
						<p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-500">Tool</p>
						<h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
							Disposable Domain Detector
						</h1>
						<p className="mt-6 text-lg/8 text-gray-300">
							Check whether a domain is currently classified as disposable, then inspect the registration,
							ownership, MX hostnames, and MX IP snapshot Gatekeepr has already enriched in the background.
						</p>
					</div>
					<div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
						<form method="GET" className="flex flex-col gap-4 md:flex-row">
							<input
								type="text"
								name="q"
								defaultValue={query}
								placeholder="Enter an email address or domain"
								className="w-full rounded-2xl border border-white/10 bg-gray-950 px-5 py-4 text-base text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
							/>
							<button
								type="submit"
								className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-6 py-4 text-base font-semibold text-white transition-all hover:bg-blue-500"
							>
								Check Domain
							</button>
						</form>
						<p className="mt-4 text-sm text-gray-400">
							The detector accepts both a domain and a full email address. WHOIS/RDAP lookups are not run
							inside the page request.
						</p>
					</div>
					<div className="mt-10">
						<ResultCard result={result} />
					</div>
				</div>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
