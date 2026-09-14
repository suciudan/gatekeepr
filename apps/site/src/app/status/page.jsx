import Header from "@/components/Header"
import Footer from "@/components/Footer"

export const metadata = {
	title: "Status | Gatekeepr",
	description: "Operational status and support path for Gatekeepr service availability issues.",
	alternates: {
		canonical: "/status",
	},
}

const states = [
	{ label: "API", value: "Operational" },
	{ label: "Dashboard", value: "Operational" },
	{ label: "Docs", value: "Operational" },
]

export default function StatusPage() {
	return (
		<div className="bg-gray-950 text-white">
			<Header />
			<main className="px-6 pb-20 pt-32 lg:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="max-w-3xl">
						<p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-500">Status</p>
						<h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
							Service health is currently reported as operational.
						</h1>
						<p className="mt-6 text-lg/8 text-gray-300">
							This page is the public status checkpoint for the Gatekeepr surface. If you notice an issue
							that is not reflected here, contact{" "}
							<a className="font-semibold text-blue-400 hover:text-blue-300" href="mailto:hello@gatekeepr.io">
								hello@gatekeepr.io
							</a>.
						</p>
					</div>
					<div className="mt-12 grid gap-4 md:grid-cols-3">
						{states.map((item) => (
							<section
								key={item.label}
								className="rounded-3xl border border-emerald-500/20 bg-emerald-500/8 p-6"
							>
								<p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
									{item.label}
								</p>
								<p className="mt-3 text-2xl font-semibold text-white">{item.value}</p>
							</section>
						))}
					</div>
				</div>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
