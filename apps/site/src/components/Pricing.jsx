import { CheckCircleIcon } from "@heroicons/react/24/outline"
import { ArrowRightIcon } from "@heroicons/react/24/solid"
import clsx from "clsx"
import Link from "next/link"

import Section from "@/components/Section"

const plans = [
	{
		name: "Free",
		description: "For testing and small projects",
		highlight: "$0 / month",
		items: [
			"1,000 checks",
			"Full API access",
			"Allow / challenge / block decisions",
			"Email, IP, and UA analysis",
			"Dashboard access"
		],
		ctaLabel: "Start Free",
		href: "/get-free-api-key",
		primary: true
	},
	{
		name: "Starter",
		description: "For growing SaaS products",
		highlight: "$29 / month",
		items: [
			"100,000 checks",
			"Usage-based billing",
			"Full API access",
			"Dashboard and logs",
			"Email support"
		],
		ctaLabel: "Start Free",
		href: "/get-free-api-key"
	},
	{
		name: "Custom",
		description: "For larger teams",
		highlight: "Volume pricing",
		items: [
			"On-premises",
			"SLA",
			"Priority support",
			"Custom limits",
			"Dedicated onboarding"
		],
		ctaLabel: "Contact Sales",
		href: "mailto:hello@gatekeepr.io?subject=Custom%20plan%20request"
	}
]

export default function Pricing() {
	return (
		<Section id="pricing" className="bg-gray-950">
			<div className="relative isolate">
				<div className="absolute left-1/2 top-0 -z-10 h-48 w-48 -translate-x-1/2 rounded-full bg-blue-600/10 blur-3xl" />
				<div className="mx-auto max-w-3xl text-center">
					<div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-blue-300">
						Pricing
					</div>
					<h2 className="mt-6 text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl lg:text-[3.4rem]/[1.04]">
						Simple Pricing
					</h2>
					<p className="mx-auto mt-6 text-base/8 text-gray-400 sm:text-lg/8 sm:whitespace-nowrap">
						Start free. Scale as your product grows.
					</p>
				</div>
				<div className="mx-auto mt-10 max-w-6xl grid gap-6 lg:mt-14 md:grid-cols-2 lg:grid-cols-3">
					{plans.map((plan) => (
						<article
							className="relative overflow-hidden flex h-full flex-col rounded-[1.8rem] border border-white/8 bg-cinder-900/55 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)] ring-1 ring-white/5 sm:p-7"
							key={plan.name}
						>
							<div className="pointer-events-none absolute inset-0">
								<div className="absolute -right-10 top-0 h-28 w-28 rounded-full bg-blue-500/10 blur-3xl" />
								<div className="absolute left-5 bottom-2 h-24 w-24 rounded-full bg-indigo-500/8 blur-3xl" />
							</div>
							<h3 className="text-2xl font-semibold tracking-tight text-white">
								{plan.name}
							</h3>
							<p className="mt-4 text-base/8 text-gray-400">
								{plan.description}
							</p>
							<div className="mt-6 border-t border-white/8 pt-5">
								<p className="text-3xl font-semibold tracking-tight text-white">
									{plan.highlight}
								</p>
							</div>
							<div className="mt-8">
								<p className="text-[0.72rem] font-semibold tracking-[0.08em] text-cinder-300">
									Includes:
								</p>
								<ul className="mt-5 space-y-4" role="list">
									{plan.items.map((item) => (
										<li className="flex items-start gap-3" key={item}>
											<CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-blue-400" />
											<span className="text-base/7 text-cinder-100">{item}</span>
										</li>
									))}
								</ul>
							</div>
							<div className="mt-8">
								{plan.href.startsWith("mailto:") ? (
									<a
										href={plan.href}
										className={clsx(
											"inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-all",
											plan.primary
												? "bg-blue-600 text-white hover:bg-blue-500"
												: "border border-white/10 bg-white/5 text-white hover:border-blue-500/30 hover:bg-white/8 hover:text-blue-100"
										)}
									>
										{plan.ctaLabel}
										<ArrowRightIcon className="size-5" />
									</a>
								) : (
									<Link
										href={plan.href}
										className={clsx(
											"inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-all",
											plan.primary
												? "bg-blue-600 text-white hover:bg-blue-500"
												: "border border-white/10 bg-white/5 text-white hover:border-blue-500/30 hover:bg-white/8 hover:text-blue-100"
										)}
									>
										{plan.ctaLabel}
										<ArrowRightIcon className="size-5" />
									</Link>
								)}
							</div>
						</article>
					))}
				</div>
			</div>
		</Section>
	)
}
