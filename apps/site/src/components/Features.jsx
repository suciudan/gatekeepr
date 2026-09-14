import clsx from "clsx"
import {
	AtSymbolIcon,
	CheckCircleIcon,
	FingerPrintIcon,
	ServerStackIcon
} from "@heroicons/react/24/outline"

import Section from "@/components/Section"

const cards = [
	{
		title: "Email intelligence",
		description: "Detect disposable, mistyped, low-quality, and suspicious email addresses before account creation.",
		icon: AtSymbolIcon,
		items: [
			"Disposable email detection",
			"Invalid or risky domains",
			"MX and domain checks",
			"Suspicious local-part patterns"
		]
	},
	{
		title: "Network signals",
		description: "Identify the origin and infrastructure of every connection request in milliseconds.",
		icon: ServerStackIcon,
		items: [
			"Hosting and data center IPs",
			"VPN and Tor detection",
			"iCloud Private Relay",
			"ASN and provider context"
		]
	},
	{
		title: "Decision engine",
		description: "Use layered heuristics across email, IP, and request signals to return a clear signup decision.",
		icon: FingerPrintIcon,
		items: [
			"Multi-signal evaluation",
			"Allow / challenge / block result",
			"Rules tuned for signup protection",
			"Built for production flows"
		]
	}
]

export default function Features() {
	return (
		<Section id="features" className="bg-gray-950">
			<div className="relative isolate">
				<div className="absolute left-1/2 top-0 -z-10 h-44 w-44 -translate-x-1/2 rounded-full bg-blue-600/12 blur-3xl" />
				<div className="absolute left-8 top-48 -z-10 h-52 w-52 rounded-full bg-violet-500/8 blur-3xl" />
				<div className="mx-auto max-w-3xl text-center">
					<div className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-blue-300">
						Why Gatekeepr
					</div>
					<h2 className="mt-6 text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl lg:text-[3.6rem]/[1.02]">
						More than just
						<span className="mt-1 block text-blue-400">email validation</span>
					</h2>
					<p className="mx-auto mt-6 max-w-3xl text-base/8 text-gray-400 sm:text-lg/8">
						Email validation tells you whether an address looks real. Gatekeepr helps you decide whether a
						signup should be trusted.
					</p>
				</div>
				<div className="mt-10 grid gap-6 lg:mt-14 lg:grid-cols-3">
					{cards.map((card) => (
						<article
							className={clsx(
								"relative overflow-hidden rounded-[1.8rem] border p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)]",
								"border-white/8 bg-cinder-900/55 ring-1 ring-white/5 sm:p-7"
							)}
							key={card.title}
						>
							<div className="pointer-events-none absolute inset-0">
								<div className="absolute -right-10 top-2 h-28 w-28 rounded-full bg-blue-500/10 blur-3xl" />
								<div className="absolute left-5 bottom-0 h-24 w-24 rounded-full bg-indigo-500/8 blur-3xl" />
							</div>
							<div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
								<card.icon className="size-7" />
							</div>
							<h3 className="max-w-xs text-2xl font-semibold tracking-tight text-white">
								{card.title}
							</h3>
							<p className="mt-4 max-w-sm text-base/8 text-gray-400">
								{card.description}
							</p>
							<ul className="mt-7 space-y-3.5" role="list">
								{card.items.map((item) => (
									<li className="flex items-center gap-3" key={item}>
										<CheckCircleIcon className="size-5 shrink-0 text-blue-400" />
										<span className="text-base/8 text-cinder-100">{item}</span>
									</li>
								))}
							</ul>
						</article>
					))}
				</div>
			</div>
		</Section>
	)
}
