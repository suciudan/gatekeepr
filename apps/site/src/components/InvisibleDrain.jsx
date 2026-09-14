import Link from "next/link"
import clsx from "clsx"
import {
	ChartBarSquareIcon,
	EnvelopeIcon,
	LifebuoyIcon,
	NoSymbolIcon,
	ServerStackIcon
} from "@heroicons/react/24/outline"

import Section from "@/components/Section"

const issues = [
	{
		title: "Free-trial abuse",
		description: "Users create multiple accounts to keep accessing your free plan or trial.",
		icon: NoSymbolIcon
	},
	{
		title: "Disposable email signups",
		description: "Temporary email addresses inflate user counts and reduce signup quality.",
		icon: EnvelopeIcon
	},
	{
		title: "Polluted product analytics",
		description: "Fake accounts distort conversion, activation, and retention data.",
		icon: ChartBarSquareIcon
	},
	{
		title: "Wasted compute and infrastructure",
		description: "Bots and repeat abusers consume resources meant for real users.",
		icon: LifebuoyIcon
	},
	{
		title: "Noisy support and ops",
		description: "Throwaway accounts generate noise, edge cases, and manual cleanup.",
		icon: ServerStackIcon
	}
]

const baseCardClassName = clsx(
	"relative overflow-hidden rounded-3xl border p-6 sm:p-8",
	"border-white/8 bg-cinder-950/80 shadow-[0_20px_60px_rgba(0,0,0,0.35)]",
	"ring-1 ring-white/5"
)

export default function InvisibleDrain() {
	return (
		<Section className="bg-gray-950 pt-8 sm:pt-10 lg:!pt-0">
			<div className="relative isolate">
				<div className="absolute -left-10 top-8 -z-10 h-40 w-40 rounded-full bg-blue-600/12 blur-3xl" />
				<div className="absolute right-0 top-24 -z-10 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
				<div className="max-w-4xl">
					<div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-blue-300">
						Why teams add Gatekeepr
					</div>
					<h2 className="mt-6 max-w-4xl text-3xl font-semibold tracking-tight text-pretty text-white sm:text-4xl lg:text-5xl">
						Fake signups cost more than they look
					</h2>
					<p className="mt-6 max-w-3xl text-base/7 text-gray-400 sm:text-lg/8">
						Most abuse does not look dramatic at first. It shows up as wasted free trials, disposable
						emails, polluted analytics, and rising infrastructure costs.
					</p>
				</div>
				<div className="mt-10 grid gap-5 lg:mt-12 lg:grid-cols-3">
					{issues.map((issue) => (
						<article
							key={issue.title}
							className={clsx(
								baseCardClassName,
								"min-h-64 transition-transform duration-200 hover:-translate-y-1"
							)}
						>
							<div className="pointer-events-none absolute inset-0">
								<div className="absolute -right-10 top-0 h-28 w-28 rounded-full bg-blue-500/10 blur-3xl" />
								<div className="absolute left-6 bottom-0 h-20 w-24 rounded-full bg-cyan-400/8 blur-2xl" />
							</div>
							<div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
								<issue.icon className="size-6" />
							</div>
							<h3 className="max-w-[14rem] text-xl font-semibold tracking-tight text-white sm:text-2xl">
								{issue.title}
							</h3>
							<p className="mt-4 max-w-xs text-sm/7 text-gray-400 sm:text-base/7">
								{issue.description}
							</p>
						</article>
					))}
					<div
						className={clsx(
							baseCardClassName,
							"flex min-h-64 flex-col justify-between",
							"border-blue-400/30 bg-linear-to-br from-blue-600 via-indigo-600 to-blue-500"
						)}
					>
						<div className="pointer-events-none absolute inset-0">
							<div className="absolute -right-12 top-0 h-32 w-32 rounded-full bg-white/18 blur-3xl" />
							<div className="absolute left-4 bottom-2 h-24 w-28 rounded-full bg-cyan-200/18 blur-3xl" />
						</div>
						<div>
							<h3 className="max-w-[14rem] text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem]">
								Works with any backend
							</h3>
							<p className="mt-4 max-w-xs text-sm/7 text-blue-50/85 sm:text-base/7">
								Add Gatekeepr to signup, onboarding, free trial, or waitlist flows.
							</p>
						</div>
						<div className="mt-8">
							<Link
								href="/get-free-api-key"
								className={clsx(
									"inline-flex w-full items-center justify-center rounded-2xl px-6 py-4 text-base font-semibold",
									"bg-white text-blue-700 shadow-lg shadow-black/20 transition-all duration-200",
									"hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-[0_20px_45px_rgba(15,23,42,0.35)]",
									"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
								)}
							>
								Start Free Trial
							</Link>
						</div>
					</div>
				</div>
			</div>
		</Section>
	)
}
