import clsx from "clsx"
import {
	ChartBarSquareIcon,
	EnvelopeIcon,
	NoSymbolIcon,
	ServerStackIcon
} from "@heroicons/react/24/outline"

import Section from "@/components/Section"

const useCases = [
	{
		title: "Stop repeat trial abuse",
		description: "Detect and slow down repeat account creation before trial abuse becomes a growth tax.",
		icon: NoSymbolIcon,
		iconClassName: "text-blue-300"
	},
	{
		title: "Block disposable emails",
		description: "Catch temporary email providers before fake signups enter your funnel.",
		icon: EnvelopeIcon,
		iconClassName: "text-blue-300"
	},
	{
		title: "Keep analytics trustworthy",
		description: "Protect activation, conversion, and retention metrics from fake accounts.",
		icon: ChartBarSquareIcon,
		iconClassName: "text-blue-300"
	},
	{
		title: "Reduce compute waste",
		description: "Prevent abusive signups from consuming credits, infrastructure, and support time.",
		icon: ServerStackIcon,
		iconClassName: "text-blue-300"
	}
]

export default function UseCases() {
	return (
		<Section className="bg-gray-950">
			<div className="relative isolate">
				<div className="absolute left-10 top-10 -z-10 h-48 w-48 rounded-full bg-blue-600/10 blur-3xl" />
				<div className="absolute right-0 top-20 -z-10 h-56 w-56 rounded-full bg-violet-500/8 blur-3xl" />
				<div className="max-w-5xl text-left">
					<div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-blue-300">
						Use cases
					</div>
					<h2 className="mt-6 text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl lg:text-[3.1rem]/[1.04]">
						Built for SaaS signup protection
					</h2>
					<p className="mt-6 max-w-3xl text-base/8 text-gray-400 sm:text-lg/8">
						Gatekeepr is designed for teams that lose money to fake signups, repeat trials, and disposable email abuse.
					</p>
				</div>
				<div className="mt-10 grid gap-6 lg:mt-14 lg:grid-cols-2">
					{useCases.map((item) => (
						<article
							className={clsx(
								"relative overflow-hidden rounded-[1.8rem] border p-6 sm:p-7",
								"border-white/8 bg-cinder-900/55 shadow-[0_24px_80px_rgba(0,0,0,0.3)] ring-1 ring-white/5"
							)}
							key={item.title}
						>
							<div className="pointer-events-none absolute inset-0">
								<div className="absolute -right-8 top-1 h-24 w-24 rounded-full bg-blue-500/10 blur-3xl" />
								<div className="absolute left-6 bottom-1 h-20 w-28 rounded-full bg-cyan-400/7 blur-3xl" />
							</div>
							<div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10">
								<item.icon className={clsx("size-6", item.iconClassName)} />
							</div>
							<h3 className="max-w-sm text-2xl font-semibold tracking-tight text-white">
								{item.title}
							</h3>
							<p className="mt-4 max-w-xl text-base/8 text-gray-400">
								{item.description}
							</p>
							{item.accent && (
								<p className="mt-4 max-w-xl text-base/8 font-medium text-cinder-100">
									{item.accent}
								</p>
							)}
						</article>
					))}
				</div>
			</div>
		</Section>
	)
}
