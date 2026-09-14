import { ArrowRightIcon } from "@heroicons/react/24/solid"
import Link from "next/link"
import Section from "@/components/Section"

export default function CTA() {
	return (
		<Section compact={true}>
			<div className="mx-auto max-w-6xl">
				<div className="relative isolate overflow-hidden rounded-[1.8rem] border border-blue-950/70 bg-cinder-900/70 px-8 py-14 shadow-[0_24px_80px_rgba(0,0,0,0.28)] ring-1 ring-white/5 sm:px-10 sm:py-16 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-12">
					<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-blue-400/40 to-transparent" />
					<div className="absolute -left-16 top-4 -z-10 h-40 w-40 rounded-full bg-blue-600/18 blur-3xl" />
					<div className="absolute right-10 top-10 -z-10 h-52 w-52 rounded-full bg-violet-500/12 blur-3xl" />
					<div className="max-w-2xl">
						<h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
							<span className="block">Protect your signup flow</span>
							<span className="block text-cinder-100">before abuse starts costing real money</span>
						</h2>
						<p className="mt-4 text-base/8 text-gray-400 sm:text-lg/8">
							Gatekeepr helps you stop disposable emails, repeat trials, and suspicious signups before
							they reach your product.
						</p>
						</div>
					<div className="mt-8 flex flex-col items-center gap-3 text-center lg:mt-0 lg:shrink-0 lg:items-start lg:text-left">
						<Link
							href="/get-free-api-key"
							className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white transition-all hover:bg-blue-500"
						>
							Start Free
							<ArrowRightIcon className="size-5" />
						</Link>
						<div className="max-w-xs space-y-1 text-sm text-gray-400 lg:max-w-none">
							<p>No credit card required</p>
							<p>1,000 free checks</p>
						</div>
					</div>
				</div>
			</div>
		</Section>
	)
}
