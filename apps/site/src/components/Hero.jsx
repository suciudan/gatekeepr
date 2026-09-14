import clsx from "clsx"
import { BookOpenIcon } from "@heroicons/react/24/outline"
import Link from "next/link"

import TryItNow from "@/components/Hero/TryItNow"
import JoinButton from "@/components/JoinButton"

export default function Hero({ title, subtitle, desc, ip }) {
	return (
		<div className="relative isolate overflow-hidden bg-linear-to-b from-gray-900 min-h-screen flex items-center">
			<div className="pointer-events-none absolute inset-0 -z-20">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_82%_12%,rgba(99,102,241,0.18),transparent_24%),radial-gradient(circle_at_72%_74%,rgba(56,189,248,0.08),transparent_26%)]" />
				<div className="absolute left-[62%] top-[-16%] h-[155%] w-48 rotate-[24deg] bg-linear-to-b from-white/14 via-blue-300/8 to-transparent blur-sm" />
				<div className="absolute -left-24 top-24 h-64 w-64 rounded-full bg-blue-600/16 blur-3xl" />
				<div className="absolute right-[-8rem] top-10 h-80 w-80 rounded-full bg-violet-500/14 blur-3xl" />
			</div>
			<div className={clsx(
				"mx-auto my-auto max-w-7xl lg:flex lg:items-center lg:justify-between lg:gap-x-8",
				"pt-24 pb-16 sm:pt-36 sm:pb-20 xl:pt-24 lg:px-8 w-full flex-1"
			)}>
				<div className="px-6 lg:px-0">
					<div className="mx-auto max-w-3xl w-full">
						<div className="max-w-xl">
							<h1
								className={clsx(
									"font-bold text-pretty text-white",
									"text-5xl sm:text-6xl tracking-tight"
								)}
							>
								{title}
							</h1>
							<p className="mt-8 text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
								{subtitle}
							</p>
							<p className="mt-2 text-base font-medium text-pretty text-gray-400">
								{desc}
							</p>
							<div className="mt-10 flex flex-col sm:flex-row items-start gap-4">
								<JoinButton />
								<Link
									href="https://docs.gatekeepr.io/"
									target="_blank"
									rel="noopener noreferrer"
									className={clsx(
										"inline-flex w-full items-center justify-center gap-2 rounded-lg border px-7 py-3 sm:w-auto",
										"border-[#1a2744] text-[15px] font-medium text-white"
									)}
								>
									<BookOpenIcon className="size-4 shrink-0" />
									View API Docs
								</Link>
							</div>
							<p className="text-gray-400 text-sm mt-2 flex flex-row flex-wrap sm:flex-nowrap gap-2 sm:gap-0">
								<span>1,000 free checks</span><span className="mx-1 sm:mx-2">•</span>
								<span>No credit card required</span><span className="mx-1 sm:mx-2">•</span>
								<span className="inline-flex items-center gap-2 sm:gap-1">
									<span className="text-xl leading-none">🇪🇺</span> hosted
								</span><span className="mx-1 sm:mx-2">•</span>
								<span>REST API</span>
							</p>
						</div>
					</div>
				</div>
				<div className="mt-20 sm:mt-24 md:mx-auto md:max-w-lg w-full lg:mx-0 lg:mt-0">
					<div className="mx-auto max-w-2xl md:mx-0 md:max-w-none">
						<TryItNow ip={ip} />
					</div>
				</div>
			</div>
			<div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-linear-to-t from-gray-950 sm:h-32"/>
		</div>
	)
}
