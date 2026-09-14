import Header from "@/components/Header"
import Footer from "@/components/Footer"
import Link from "next/link"

export const metadata = {
	title: "Email Verifier | Gatekeepr",
	description: "Verify email quality signals before account creation or onboarding actions.",
	alternates: {
		canonical: "/tools/email-verifier",
	},
}

export default function EmailVerifierPage() {
	return (
		<div className="bg-gray-950 text-white">
			<Header />
			<main className="px-6 pb-20 pt-32 lg:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="max-w-3xl">
						<p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-500">Tool</p>
						<h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
							Email Verifier
						</h1>
						<p className="mt-6 text-lg/8 text-gray-300">
							This tool route gives the header and footer a concrete verifier destination. It currently
							points users toward Gatekeepr&apos;s email-intelligence workflow, which combines basic email
							verification with risk screening for signup decisions.
						</p>
					</div>
					<div className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-6">
						<h2 className="text-xl font-semibold text-white">Next step</h2>
						<p className="mt-3 text-base/7 text-gray-300">
							Review the existing email-intelligence page for the current product surface and integration
							direction.
						</p>
						<Link
							href="/product/email-intelligence"
							className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white transition-all hover:bg-blue-500"
						>
							Open Email Intelligence
						</Link>
					</div>
				</div>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
