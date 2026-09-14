import clsx from "clsx"
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from "@heroicons/react/24/solid"
import {
	ArrowRightIcon,
} from "@heroicons/react/24/outline"

import CopySnippetButton from "@/components/CopySnippetButton"
import Section from "@/components/Section"

const decisions = [
	{
		title: "Allow",
		icon: CheckCircleIcon,
		// desc: "— likely legitimate signup",
		cardClassName: "border-emerald-500/15 bg-emerald-500/5",
		iconClassName: "text-emerald-300"
	},
	{
		title: "Challenge",
		icon: ExclamationTriangleIcon,
		// desc: "— suspicious signup that needs extra verification",
		cardClassName: "border-amber-500/15 bg-amber-500/5",
		iconClassName: "text-amber-300"
	},
	{
		title: "Block",
		icon: XCircleIcon,
		// desc: "— high-confidence fake or abusive signup",
		cardClassName: "border-rose-500/15 bg-rose-500/5",
		iconClassName: "text-rose-300"
	}
]

const requestSnippet = `curl -X POST "https://api.gatekeepr.io" \\
  -H "Authorization: [API_KEY]" \\
  -d '{
    "email": "john@gmail.com",
    "ip": "0.0.0.0",
    "user_agent": "Mozilla/5.0 ..."
  }'`

const requestLines = [
	[
		{ text: "curl", className: "text-blue-400" },
		{ text: " -X POST ", className: "text-gray-200" },
		{ text: "\"https://api.gatekeepr.io\"", className: "text-white" },
		{ text: " \\", className: "text-cinder-500" }
	],
	[
		{ text: "  -H ", className: "text-gray-200" },
		{ text: "\"Authorization: ", className: "text-cinder-300" },
		{ text: "[API_KEY]", className: "text-emerald-300" },
		{ text: "\"", className: "text-cinder-300" },
		{ text: " \\", className: "text-cinder-500" }
	],
	[
		{ text: "  -d ", className: "text-gray-200" },
		{ text: "'{", className: "text-cinder-300" }
	],
	[
		{ text: "    \"email\"", className: "text-blue-300" },
		{ text: ": ", className: "text-cinder-300" },
		{ text: "\"john@gmail.com\"", className: "text-emerald-300" },
		{ text: ",", className: "text-cinder-300" }
	],
	[
		{ text: "    \"ip\"", className: "text-blue-300" },
		{ text: ": ", className: "text-cinder-300" },
		{ text: "\"0.0.0.0\"", className: "text-emerald-300" },
		{ text: ",", className: "text-cinder-300" }
	],
	[
		{ text: "    \"user_agent\"", className: "text-blue-300" },
		{ text: ": ", className: "text-cinder-300" },
		{ text: "\"Mozilla/5.0 ...\"", className: "text-emerald-300" }
	],
	[
		{ text: "  }'", className: "text-cinder-300" }
	]
]

const responseLines = [
	[
		{ text: "{", className: "text-cinder-300" }
	],
	[
		{ text: "  \"status\"", className: "text-blue-300" },
		{ text: ": ", className: "text-cinder-300" },
		{ text: "\"allow\"", className: "text-emerald-300" },
		{ text: ",", className: "text-cinder-300" }
	],
	[
		{ text: "  \"threats\"", className: "text-blue-300" },
		{ text: ": ", className: "text-cinder-300" },
		{ text: "[]", className: "text-cinder-200" },
		{ text: ",", className: "text-cinder-300" }
	],
	[
		{ text: "  \"trust\"", className: "text-blue-300" },
		{ text: ": ", className: "text-cinder-300" },
		{ text: "[\"email_passes_rfc5322\"]", className: "text-violet-300" }
	],
	[
		{ text: "}", className: "text-cinder-300" }
	]
]

function CodeLine({ lineNumber, tokens }) {
	return (
		<div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-4">
			<span className="select-none text-right text-cinder-500">{lineNumber}</span>
			<span className="block min-w-0 whitespace-pre-wrap break-words">
				{tokens.map((token, index) => (
					<span className={token.className} key={index}>{token.text}</span>
				))}
			</span>
		</div>
	)
}

export default function HowItWorks({ containerClassName }) {
	return (
		<Section id="how-it-works" className="bg-gray-950" containerClassName={containerClassName}>
			<div className="relative isolate overflow-hidden rounded-[2rem] border border-blue-950/70 bg-cinder-900/70 px-6 py-8 shadow-[0_35px_120px_rgba(0,0,0,0.45)] ring-1 ring-white/5 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
				<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-blue-400/40 to-transparent" />
				<div className="absolute -left-16 top-4 -z-10 h-40 w-40 rounded-full bg-blue-600/18 blur-3xl" />
				<div className="absolute right-10 top-10 -z-10 h-52 w-52 rounded-full bg-violet-500/12 blur-3xl" />
				<div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
					<div className="max-w-2xl">
						<div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-blue-300">
							How it works
						</div>
						<h2 className="mt-6 max-w-xl text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl lg:text-[3.6rem]/[1.02]">
							A single API call protects your
							<span className="mt-1 block text-blue-600">signup flow</span>
						</h2>
						<p className="mt-6 max-w-xl text-base/8 text-gray-400 sm:text-lg/8">
							Send the signup data you already collect.
						</p>
						<div className="mt-4">
							<p className="max-w-xl text-sm/7 font-medium text-cinder-200 sm:text-base/7">
								Gatekeepr analyzes multiple risk signals and returns a decision your application can act on immediately.
							</p>
							<div className="mt-5 flex flex-col items-start gap-2">
								<a
									href="https://docs.gatekeepr.io/"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm/7 font-semibold text-white transition-all hover:border-blue-500/30 hover:bg-white/8 hover:text-blue-100 sm:text-base/7"
								>
									Explore documentation
									<ArrowRightIcon className="size-4" />
								</a>
							</div>
							{/*<div className="mt-5 grid gap-4" role="list">
								{decisions.map((decision) => (
									<div
										className={clsx(
											"h-full rounded-2xl border px-3.5 py-3.5 shadow-[0_10px_35px_rgba(0,0,0,0.18)]",
											decision.cardClassName
										)}
										key={decision.title}
										role="listitem"
									>
										<div className="flex items-start gap-4">
											<decision.icon className={clsx("mt-0.5 size-6 shrink-0", decision.iconClassName)} />
											<div className="min-w-0">
												<h3 className="text-base font-semibold text-white">{decision.title}</h3>
												<p className="mt-1 text-sm/6 text-cinder-100 sm:mt-0 sm:text-base/7">
													<span className="hidden sm:inline">{decision.desc}</span>
													<span className="sm:hidden">{decision.desc}</span>
												</p>
											</div>
										</div>
									</div>
								))}
							</div>*/}
						</div>
					</div>
					<div className="relative">
						<div className="absolute inset-x-8 top-8 -z-10 h-48 rounded-full bg-blue-600/20 blur-3xl" />
						<div className="overflow-hidden rounded-[1.6rem] border border-blue-950/80 bg-cinder-950/95 shadow-[0_30px_90px_rgba(30,64,175,0.22)] ring-1 ring-white/5">
							<div className="relative border-b border-white/5 px-5 py-5 pr-24">
								<div className="absolute top-5 right-5">
									<CopySnippetButton value={requestSnippet} />
								</div>
								<div className="overflow-hidden font-mono text-[0.78rem]/7 sm:text-[0.82rem]/7">
									{requestLines.map((line, index) => (
										<CodeLine key={index} lineNumber={index + 1} tokens={line} />
									))}
								</div>
							</div>
							<div className="border-t border-white/5 bg-cinder-900/70 px-5 py-5">
								<div className="flex items-center justify-between gap-4">
									<p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cinder-300">
										Response example
									</p>
									<span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-emerald-300">
										200 OK
									</span>
								</div>
								<div className="mt-4 overflow-hidden font-mono text-[0.78rem]/7 sm:text-[0.82rem]/7">
									{responseLines.map((line, index) => (
										<CodeLine key={index} lineNumber={index + 1} tokens={line} />
									))}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</Section>
	)
}
