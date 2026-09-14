import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { CircleAlert } from "lucide-react"

import Header from "@/components/Header"
import Footer from "@/components/Footer"
import { getDisposableProviderBySlug } from "@/libs/disposable-providers"
import {
	getSearchParamValue,
	selectProviderDomainPage
} from "@/libs/disposable-provider-domain-page"
import ProviderDomains from "./ProviderDomains"

export const revalidate = 3600

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

function createProviderPath(provider, searchParams) {
	const query = new URLSearchParams()
	for(const [key, value] of Object.entries(searchParams || {})) {
		if(Array.isArray(value)) {
			for(const item of value) {
				if(typeof item === "string") query.append(key, item)
			}
			continue
		}
		if(typeof value === "string") query.set(key, value)
	}
	const search = query.toString()
	return `/disposable-email-data/${provider.pathSlug || provider.slug}${search ? `?${search}` : ""}`
}

export async function generateMetadata({ params }) {
	const resolvedParams = await params
	const provider = await getDisposableProviderBySlug(resolvedParams?.slug)
	if(!provider) {
		return {
			title: "Disposable Email Provider | Gatekeepr",
			robots: {
				index: false,
				follow: false
			}
		}
	}

	return {
		title: `${provider.label} Disposable Email Provider | Gatekeepr`,
		description: `${provider.label} appears to be a disposable email provider often used for temporary signups, fake accounts, spam, or free trial abuse.`,
		alternates: {
			canonical: `/disposable-email-data/${provider.pathSlug || provider.slug}`,
		},
	}
}

export default async function DisposableProviderPage({ params, searchParams }) {
	const resolvedParams = await params
	const resolvedSearchParams = await searchParams
	const provider = await getDisposableProviderBySlug(resolvedParams?.slug)
	if(!provider) notFound()
	if(resolvedParams?.slug !== (provider.pathSlug || provider.slug)) {
		redirect(createProviderPath(provider, resolvedSearchParams))
	}
	const query = getSearchParamValue(resolvedSearchParams?.q).trim().toLowerCase()
	const currentPage = Math.max(1, Math.floor(Number(getSearchParamValue(resolvedSearchParams?.page)) || 1))
	const initialDomainResult = selectProviderDomainPage(provider, {
		query,
		page: currentPage
	})

	return (
		<div className="min-h-screen bg-gray-950 text-white">
			<Header />
			<main className="pb-20">
				<section className="border-b border-white/5 bg-[linear-gradient(180deg,#081120_0%,#050c18_56%,#030712_100%)] pt-20 sm:pt-24">
					<div className="mx-auto max-w-7xl px-6 pb-14 sm:pb-16 lg:px-8">
						<div className="max-w-5xl py-8 sm:py-12">
							<Link href="/disposable-email-data" className="text-sm font-semibold text-blue-400 hover:text-blue-300">
								Disposable email data
							</Link>
							<h1 className="mt-5 break-words text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
								{provider.label}
							</h1>
							<div className="mt-7 flex max-w-4xl items-center gap-3 rounded-lg border border-red-400/40 bg-red-950/35 px-5 py-4 text-base/7 font-semibold text-red-100">
								<CircleAlert className="h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
								<span>This was identified as a temporary email provider.</span>
							</div>
							<div className="mt-6 max-w-4xl space-y-5 text-lg/8 text-gray-300">
								<p>
									{provider.label} appears to be a disposable email provider. This service allows users to create
									temporary email addresses that may only be used once or for a short period of time. For SaaS
									products, newsletters, and online platforms, this can lead to fake signups, low-quality accounts,
									free-trial abuse, and unreliable customer data.
								</p>
								<p>
									Use Gatekeepr to check email domains like {provider.label} in real time and decide whether to
									allow, challenge, or block a signup.{" "}
									<Link href="/get-free-api-key" className="font-semibold text-blue-400 hover:text-blue-300">
										Create a free account
									</Link>{" "}
									and get 1,000 monthly checks included.
								</p>
							</div>
						</div>
						<dl className="grid gap-px overflow-hidden border-y border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
							<div className="bg-gray-950 px-5 py-5">
								<dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Domains</dt>
								<dd className="mt-2 text-2xl font-semibold text-white">
									{provider.domainCount.toLocaleString("en-US")}
								</dd>
							</div>
							<div className="bg-gray-950 px-5 py-5">
								<dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">MX Hosts</dt>
								<dd className="mt-2 text-2xl font-semibold text-white">
									{provider.mxHosts.length.toLocaleString("en-US")}
								</dd>
							</div>
							<div className="bg-gray-950 px-5 py-5">
								<dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">MX IPs</dt>
								<dd className="mt-2 text-2xl font-semibold text-white">
									{(provider.mxIpv4.length + provider.mxIpv6.length).toLocaleString("en-US")}
								</dd>
							</div>
							<div className="bg-gray-950 px-5 py-5">
								<dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Last Seen</dt>
								<dd className="mt-2 text-lg font-semibold text-white">
									{formatDate(provider.lastSeenAt || provider.lastEnrichedAt)}
								</dd>
							</div>
						</dl>
					</div>
				</section>

				<section className="mx-auto max-w-7xl px-6 pt-10 lg:px-8">
					<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
						<div>
							<ProviderDomains
								initialResult={initialDomainResult}
								providerSlug={provider.pathSlug || provider.slug}
							/>
						</div>

						<aside className="space-y-8">
							<section className="py-6">
								<h2 className="text-lg font-semibold text-white">Infrastructure</h2>
								<dl className="mt-5 space-y-5 text-sm">
									<div>
										<dt className="font-semibold text-gray-400">Grouped MX hostname</dt>
										<dd className="mt-1 break-words text-gray-200">{provider.label}</dd>
									</div>
									<div>
										<dt className="font-semibold text-gray-400">MX Hostnames</dt>
										<dd className="mt-1 break-words text-gray-200">{formatList(provider.mxHosts)}</dd>
									</div>
									<div>
										<dt className="font-semibold text-gray-400">IPv4</dt>
										<dd className="mt-1 break-words text-gray-200">{formatList(provider.mxIpv4)}</dd>
									</div>
									<div>
										<dt className="font-semibold text-gray-400">IPv6</dt>
										<dd className="mt-1 break-words text-gray-200">{formatList(provider.mxIpv6)}</dd>
									</div>
								</dl>
							</section>
						</aside>
					</div>
				</section>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
