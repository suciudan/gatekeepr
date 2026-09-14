import Header from "@/components/Header"
import Footer from "@/components/Footer"
import Link from "next/link"

export const metadata = {
	title: "Privacy | Gatekeepr",
	description: "Privacy overview and links to Gatekeepr data handling and legal terms.",
	alternates: {
		canonical: "/privacy",
	},
}

export default function PrivacyPage() {
	return (
		<div className="bg-gray-950 text-white">
			<Header />
			<main className="px-6 pb-20 pt-32 lg:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="max-w-3xl">
						<p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-500">Privacy</p>
						<h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
							Privacy commitments are centered on limited inputs, limited processing, and clear documentation.
						</h1>
						<p className="mt-6 text-lg/8 text-gray-300">
							Gatekeepr evaluates the signals already present in a signup flow and is designed to avoid
							turning that workflow into a broad data collection system. The operational and contractual
							details are documented in the legal pages below.
						</p>
					</div>
					<div className="mt-12 grid gap-6 md:grid-cols-2">
						<Link
							href="/legal/terms-of-service"
							className="rounded-3xl border border-white/10 bg-white/5 p-6 transition-all hover:border-blue-500/40 hover:bg-white/7"
						>
							<h2 className="text-xl font-semibold text-white">Terms of Service</h2>
							<p className="mt-3 text-base/7 text-gray-300">
								Service terms, infrastructure notes, cookie usage, and analytics disclosures.
							</p>
						</Link>
						<Link
							href="/legal/data-processing-agreement"
							className="rounded-3xl border border-white/10 bg-white/5 p-6 transition-all hover:border-blue-500/40 hover:bg-white/7"
						>
							<h2 className="text-xl font-semibold text-white">Data Processing Agreement</h2>
							<p className="mt-3 text-base/7 text-gray-300">
								Controller and processor responsibilities, subprocessors, and data handling terms.
							</p>
						</Link>
					</div>
				</div>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
