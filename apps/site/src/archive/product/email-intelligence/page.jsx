import {
	AtSymbolIcon,
	ArrowRightIcon,
	CheckBadgeIcon,
	CheckIcon,
	EnvelopeIcon,
	EyeIcon,
	ShieldCheckIcon,
	SparklesIcon,
	TagIcon,
	UserGroupIcon,
} from "@heroicons/react/24/solid"
import {
	AtSymbolIcon as AtSymbolOutlineIcon,
	BoltIcon,
	BookOpenIcon,
	CheckBadgeIcon as CheckBadgeOutlineIcon,
	CheckCircleIcon as CheckCircleOutlineIcon,
	ClockIcon,
	DocumentTextIcon,
	EnvelopeIcon as EnvelopeOutlineIcon,
	EyeIcon as EyeOutlineIcon,
	ShieldExclamationIcon as ShieldExclamationOutlineIcon,
	ShieldCheckIcon as ShieldCheckOutlineIcon,
	SparklesIcon as SparklesOutlineIcon,
	TagIcon as TagOutlineIcon,
	StarIcon,
	UserGroupIcon as UserGroupOutlineIcon,
	XCircleIcon as XCircleOutlineIcon,
} from "@heroicons/react/24/outline"
import Link from "next/link"

import Footer from "@/components/Footer"
import Header from "@/components/Header"
import { isUserLoggedIn } from "@/libs/user"

import FaqAccordion from "./FaqAccordion"

export const metadata = {
	title: "Disposable Email Detection API | Gatekeepr",
	description: "Detect temporary, risky, and suspicious email addresses in real time. Gatekeepr helps you block fake signups and improve signup quality before account creation.",
	alternates: {
		canonical: "/product/email-intelligence",
	},
}

const heroSignals = [
	{
		title: "Disposable domains",
		description: "Detect throwaway email providers",
		icon: ShieldCheckOutlineIcon,
		iconBg: "bg-rose-500/20",
		iconBorder: "border-rose-500/45",
		iconColor: "text-rose-400",
	},
	{
		title: "Role accounts",
		description: "Flag generic shared inboxes",
		icon: UserGroupOutlineIcon,
		iconBg: "bg-amber-500/20",
		iconBorder: "border-amber-500/45",
		iconColor: "text-amber-400",
	},
	{
		title: "Suspicious aliases",
		description: "Catch repeat trial abuse",
		icon: AtSymbolOutlineIcon,
		iconBg: "bg-rose-500/20",
		iconBorder: "border-rose-500/45",
		iconColor: "text-rose-400",
	},
	{
		title: "Explainable decisions",
		description: "Clear reasons for every verdict",
		icon: EyeOutlineIcon,
		iconBg: "bg-emerald-500/20",
		iconBorder: "border-emerald-500/45",
		iconColor: "text-emerald-400",
	},
]

const valueTimeline = [
	{
		title: "Catch throwaways early",
		description: "Stop temporary email domains before they create fake accounts.",
		icon: BoltIcon,
	},
	{
		title: "Decide in real time",
		description: "Allow, challenge, or block during registration.",
		icon: ClockIcon,
	},
	{
		title: "See why it happened",
		description: "Get threats, trust signals, blocklists, and useful context in the response.",
		icon: DocumentTextIcon,
	},
]

const comparisonColumns = [
	{
		title: "Email Validation",
		description: "Checks format and basic domain health.",
		bullets: ["Syntax checks", "Basic domain checks", "MX checks"],
		footer: "Useful for syntax. Not enough for signup risk.",
	},
	{
		title: "Email Intelligence",
		description: "Checks whether an email should be trusted at signup.",
		bullets: [
			"Disposable email detection",
			"Role-based email detection",
			"Suspicious +tag usage",
			"Separator abuse",
			"Local-part pattern analysis",
			"Domain and provider context",
		],
		footer: "Disposable domains, role accounts, suspicious aliases, and local-part patterns.",
		featured: true,
	},
	{
		title: "Signup Protection",
		description: "Combines email, IP, and user agent into a broader decision.",
		bullets: ["Email intelligence", "IP signals", "User agent analysis", "Final signup decision"],
		footer: "Best for teams that want full registration protection.",
	},
]

const checks = [
	{
		title: "Disposable domains",
		description: "Detect temporary and throwaway inbox providers.",
		icon: EnvelopeOutlineIcon,
		glow: "left-2 top-2 h-36 w-44 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.14)_0%,rgba(37,99,235,0.06)_38%,transparent_72%)] blur-2xl",
	},
	{
		title: "Role-based addresses",
		description: "Flag inboxes like admin@, info@, and support@.",
		icon: UserGroupOutlineIcon,
		glow: "right-2 top-4 h-36 w-44 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.13)_0%,rgba(37,99,235,0.05)_38%,transparent_72%)] blur-2xl",
	},
	{
		title: "Suspicious plus tags",
		description: "Catch alias patterns often used for repeat signups.",
		icon: TagOutlineIcon,
		glow: "right-4 top-1 h-36 w-40 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.12)_0%,rgba(37,99,235,0.05)_40%,transparent_74%)] blur-2xl",
	},
	{
		title: "Separator abuse",
		description: "Identify excessive punctuation and unnatural structure.",
		icon: SparklesOutlineIcon,
		glow: "left-4 bottom-0 h-36 w-44 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.13)_0%,rgba(37,99,235,0.05)_38%,transparent_72%)] blur-2xl",
	},
	{
		title: "Artificial local parts",
		description: "Spot usernames that look generated or manipulated.",
		icon: ShieldExclamationOutlineIcon,
		glow: "right-3 bottom-0 h-36 w-44 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.12)_0%,rgba(37,99,235,0.05)_38%,transparent_72%)] blur-2xl",
	},
	{
		title: "Domain and MX context",
		description: "Return useful provider and domain-level email signals.",
		icon: CheckBadgeOutlineIcon,
		glow: "right-2 bottom-1 h-36 w-44 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.12)_0%,rgba(37,99,235,0.05)_38%,transparent_72%)] blur-2xl",
	},
]

const patternExamples = [
	{
		pattern: "Disposable inbox",
		example: "newaccount847@temporarymail.example",
		explanation: "Common in fake or one-time signups.",
		dot: "bg-rose-600",
	},
	{
		pattern: "Role account",
		example: "admin@company.com",
		explanation: "Often shared, generic, or low-intent.",
		dot: "bg-amber-600",
	},
	{
		pattern: "Suspicious alias",
		example: "jane+trial-7@provider.com",
		explanation: "Can indicate repeat trial creation.",
		dot: "bg-rose-600",
	},
	{
		pattern: "Separator abuse",
		example: "john....doe---2026@provider.com",
		explanation: "Often associated with generated signups.",
		dot: "bg-amber-600",
	},
	{
		pattern: "Artificial local part",
		example: "x9t4q7m2@provider.com",
		explanation: "High-randomness structure can be a risk signal.",
		dot: "bg-rose-600",
	},
]

const decisions = [
	{
		title: "Allow",
		description: "The email looks normal and low risk.",
		icon: CheckCircleOutlineIcon,
		color: "text-emerald-400",
		bg: "bg-emerald-900/30",
		border: "border-emerald-500/25",
		iconBg: "bg-emerald-900/45",
	},
	{
		title: "Challenge",
		description: "The email looks suspicious enough to require verification, CAPTCHA, or OTP.",
		icon: ShieldExclamationOutlineIcon,
		color: "text-amber-400",
		bg: "bg-amber-900/20",
		border: "border-amber-500/25",
		iconBg: "bg-amber-900/40",
	},
	{
		title: "Block",
		description: "The email strongly indicates throwaway or abusive signup intent.",
		icon: XCircleOutlineIcon,
		color: "text-rose-400",
		bg: "bg-rose-900/25",
		border: "border-rose-500/25",
		iconBg: "bg-rose-900/40",
	},
]

const useCases = [
	{
		title: "Block disposable email signups",
		description: "Stop throwaway inboxes before they become accounts.",
		icon: EnvelopeOutlineIcon,
	},
	{
		title: "Improve free-trial quality",
		description: "Reduce low-intent users and repeat signup abuse.",
		icon: ShieldCheckOutlineIcon,
	},
	{
		title: "Protect waitlists and lead forms",
		description: "Filter suspicious emails before they enter your pipeline.",
		icon: CheckBadgeOutlineIcon,
	},
	{
		title: "Reduce fake self-serve accounts",
		description: "Screen users before provisioning or onboarding starts.",
		icon: UserGroupOutlineIcon,
	},
	{
		title: "Catch suspicious signups earlier",
		description: "Use email as the first abuse filter in registration.",
		icon: EyeOutlineIcon,
	},
]

const faqs = [
	{
		question: "What is the difference between email validation and email intelligence?",
		answer: "Email validation checks format and basic domain health. Email intelligence checks whether the email should be trusted at signup.",
	},
	{
		question: "Do you support disposable email detection and role-based email detection?",
		answer: "Yes. Gatekeepr detects disposable domains, role-based addresses, suspicious plus tags, separator abuse, and artificial local-part patterns.",
	},
	{
		question: "Can I use Gatekeepr before account creation?",
		answer: "Yes. Gatekeepr is built to run during registration so you can act before the account is created.",
	},
	{
		question: "What should I do when an email is marked challenge?",
		answer: "Most teams use challenge to trigger email verification, CAPTCHA, OTP, or another step before allowing the signup through.",
	},
]

const requestCode = `POST /v1/signup/check
Content-Type: application/json
Authorization: Bearer sk_live_xxx

{
  "email": "jane+trial-7@tempmail.io",
  "ip": "203.0.113.10",
  "user_agent": "Mozilla/5.0 ..."
}`

const responseCode = `{
  "status": "challenge",
  "threats": [
    "disposable_email",
    "suspicious_plus_alias"
  ],
  "trust_signals": [
    "known_provider_context"
  ],
  "info": {
    "email": {
      "is_disposable": true,
      "is_role_based": false,
      "has_plus_tag": true,
      "local_part_pattern": "suspicious"
    }
  }
}`

function HeroPrimaryLink({ href, children }) {
	return (
		<Link
			href={href}
			className="inline-flex h-[47px] w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-7 text-base font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_30px_rgba(37,99,235,0.3)] sm:w-auto"
		>
			{children}
			<ArrowRightIcon className="size-4" />
		</Link>
	)
}

function HeroSecondaryLink({ href, children }) {
	return (
		<Link
			href={href}
			className="inline-flex h-[47px] w-full items-center justify-center gap-2 rounded-lg border border-[#1a2744] px-7 text-base font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.04] sm:w-auto"
		>
			<BookOpenIcon className="size-4 shrink-0" />
			{children}
		</Link>
	)
}

function SectionIntro({ title, description, align = "center" }) {
	return (
		<div className={align === "left" ? "max-w-3xl" : "mx-auto max-w-3xl text-center"}>
			<h2 className="text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl lg:text-[3.1rem]/[1.04]">
				{title}
			</h2>
			{description ? (
				<p className={`${align === "left" ? "" : "mx-auto "}mt-5 max-w-2xl text-lg font-medium text-pretty text-gray-400 sm:text-xl/8`}>
					{description}
				</p>
			) : null}
		</div>
	)
}

function SectionAura({ desktopClassName, mobileClassName }) {
	return (
		<>
			<div className="pointer-events-none absolute inset-x-0 top-8 -z-10 flex justify-center md:hidden">
				<div className={`h-32 w-40 rounded-full blur-3xl ${mobileClassName}`} />
			</div>
			<div className={`pointer-events-none absolute -z-10 hidden rounded-full blur-3xl md:block ${desktopClassName}`} />
		</>
	)
}

function HighlightedResponse({ code }) {
	return code.split("\n").map((line, index) => {
		if (line.includes('"status"')) {
			return (
					<div key={index}>
						<span className="text-gray-500">{"  "}</span>
						<span className="text-blue-500">&quot;status&quot;</span>
						<span className="text-gray-500">: </span>
						<span className="text-amber-500">&quot;challenge&quot;</span>
						<span className="text-gray-500">,</span>
					</div>
				)
			}

		if (line.includes('"disposable_email"') || line.includes('"suspicious_plus_alias"')) {
			const value = line.includes("disposable_email") ? '"disposable_email"' : '"suspicious_plus_alias"'
			const suffix = line.trim().endsWith(",") ? "," : ""

				return (
					<div key={index}>
						<span className="text-gray-500">{"    "}</span>
						<span className="text-rose-500">{value}</span>
						<span className="text-gray-500">{suffix}</span>
					</div>
				)
			}

		if (line.includes('"known_provider_context"')) {
				return (
					<div key={index}>
						<span className="text-gray-500">{"    "}</span>
						<span className="text-emerald-500">&quot;known_provider_context&quot;</span>
					</div>
				)
			}

		if (line.includes("true")) {
			const prefix = line.trim().endsWith(",") ? line.replace("true,", "") : line.replace("true", "")

				return (
					<div key={index}>
						<span className="text-gray-500">{prefix}</span>
						<span className="text-emerald-500">true</span>
						<span className="text-gray-500">{line.trim().endsWith(",") ? "," : ""}</span>
					</div>
				)
		}

		if (line.includes("false")) {
			const prefix = line.trim().endsWith(",") ? line.replace("false,", "") : line.replace("false", "")

			return (
				<div key={index}>
					<span className="text-gray-500">{prefix}</span>
					<span className="text-slate-400">false</span>
					<span className="text-gray-500">{line.trim().endsWith(",") ? "," : ""}</span>
				</div>
			)
		}

		if (line.includes('"suspicious"')) {
				return (
					<div key={index}>
						<span className="text-gray-500">{"      "}</span>
						<span className="text-blue-500">&quot;local_part_pattern&quot;</span>
						<span className="text-gray-500">: </span>
						<span className="text-amber-500">&quot;suspicious&quot;</span>
					</div>
				)
			}

		return (
			<div key={index} className="text-gray-500">
				{line}
			</div>
		)
	})
}

function CodeBlock({ label, code, variant = "request" }) {
	return (
		<div className="overflow-hidden rounded-xl border border-white/8 bg-[#060a14]">
			<div className="flex items-center gap-2 border-b border-white/8 bg-[#0a0f1c] px-4 py-2.5">
				<div className="flex gap-1.5">
					<div className="h-2.5 w-2.5 rounded-full bg-rose-400/60" />
					<div className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
					<div className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
				</div>
				<p className="ml-2 text-xs font-medium text-gray-400">{label}</p>
				</div>
				<pre className="overflow-x-auto p-5">
					<code className="font-mono text-[13px] leading-6">
						{variant === "response" ? (
							<HighlightedResponse code={code} />
						) : (
							<span className="text-gray-400">{code}</span>
						)}
					</code>
				</pre>
			</div>
		)
}

export default async function EmailIntelligencePage() {
	const session = await isUserLoggedIn()

	return (
		<div className="min-h-screen overflow-x-hidden bg-gray-950 text-white">
			<Header session={session} />
			<main className="overflow-x-hidden">
				<section className="relative isolate flex min-h-screen items-center overflow-hidden px-6 lg:px-8">
					<div className="absolute inset-0 pointer-events-none">
						<div className="absolute left-1/2 top-0 h-[36rem] w-[50rem] -translate-x-1/2 rounded-full bg-blue-600/8 blur-[120px]" />
					</div>
					<div className="relative z-10 mx-auto w-full max-w-6xl pt-24 pb-16 sm:pt-36 sm:pb-20 xl:pt-24">
						<div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
							<div className="flex flex-col justify-center">
								<div className="mb-5 inline-flex w-fit items-center gap-3 rounded-full border border-blue-500/20 bg-blue-500/5 px-5 py-2">
									<ShieldCheckOutlineIcon className="size-4 text-blue-500" />
									<span className="text-sm font-semibold text-blue-500">Email Intelligence</span>
								</div>
								<div className="max-w-xl">
									<h1 className="font-bold tracking-tight text-pretty text-white text-5xl sm:text-6xl">
										Disposable Email Detection{" "}
										<span className="bg-linear-to-r from-blue-500 to-blue-300 bg-clip-text text-transparent">
											&amp; Email Intelligence
										</span>
									</h1>
									<p className="mt-8 text-xl font-medium text-pretty text-white sm:text-2xl/8">
										Stop fake signups at the email layer.
									</p>
									<p className="mt-2 text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
										Go beyond email validation with real-time disposable email detection for suspicious and low-quality addresses.
									</p>
									<div className="mt-10 flex flex-col items-start gap-4 sm:flex-row">
										<HeroPrimaryLink href={session ? "/dashboard" : "/get-free-api-key"}>
											Start Free
										</HeroPrimaryLink>
										<HeroSecondaryLink href="https://docs.gatekeepr.io">
											Explore Docs
										</HeroSecondaryLink>
									</div>
								</div>
							</div>

							<div className="relative flex flex-col justify-center">
								<div className="pointer-events-none absolute -inset-4">
									<div className="absolute left-1/2 top-1/2 h-[250px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/6 blur-[80px]" />
								</div>
								<div className="relative ml-auto w-full max-w-[45rem] space-y-3">
									{heroSignals.map((item) => (
										<div
											key={item.title}
											className="flex items-center gap-4 rounded-xl border border-[#1a2744]/60 bg-[#0c1322] px-5 py-4 transition-all duration-300 hover:border-blue-500/20"
										>
											<div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${item.iconBg} ${item.iconBorder}`}>
												<item.icon className={`size-5 ${item.iconColor}`} />
											</div>
											<div className="min-w-0 flex-1">
												<p className="text-base font-semibold tracking-tight text-white">{item.title}</p>
												<p className="text-sm/6 text-gray-400 sm:text-base/7">{item.description}</p>
											</div>
											<CheckIcon className="size-5 shrink-0 text-blue-500" />
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="relative px-6 py-16 md:py-24 lg:px-8">
					<div className="relative isolate mx-auto max-w-6xl overflow-hidden md:overflow-visible">
						<SectionAura
							mobileClassName="bg-blue-600/10"
							desktopClassName="-left-14 top-10 h-44 w-44 bg-blue-600/12"
						/>
						<div className="mb-20">
							<SectionIntro
								title="Email is the first trust signal at signup"
								description="Before a user becomes an account, their email already tells you whether the signup looks real, risky, or low-intent."
							/>
						</div>

						<div className="relative mx-auto max-w-3xl">
							<div className="absolute bottom-0 left-1/2 top-0 hidden w-px -translate-x-1/2 bg-linear-to-b from-transparent via-blue-500/30 to-transparent md:block" />
							<div className="space-y-0">
								{valueTimeline.map((feature, index) => {
									const isLeft = index % 2 === 0

									return (
										<div key={feature.title} className="group relative flex items-center py-8 first:pt-0 last:pb-0 md:py-12">
											<div className={`hidden flex-1 pr-12 md:block ${isLeft ? "" : "pointer-events-none opacity-0"}`}>
												{isLeft && (
													<div className="text-right">
															<h3 className="mb-2 text-xl font-semibold tracking-tight text-white/90 transition-colors duration-300 group-hover:text-white">
															{feature.title}
														</h3>
															<p className="text-base/8 text-gray-400">
															{feature.description}
														</p>
													</div>
												)}
											</div>

											<div className="relative z-10 mx-auto shrink-0 md:mx-0">
												<div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-blue-500/30 bg-gray-950 transition-all duration-300 group-hover:border-blue-500 group-hover:shadow-[0_0_20px_rgba(37,99,235,0.25)]">
													<feature.icon className="size-5 text-blue-400/70 transition-colors duration-300 group-hover:text-blue-400" />
												</div>
											</div>

											<div className={`hidden flex-1 pl-12 md:block ${isLeft ? "pointer-events-none opacity-0" : ""}`}>
												{!isLeft && (
													<div className="text-left">
															<h3 className="mb-2 text-xl font-semibold tracking-tight text-white/90 transition-colors duration-300 group-hover:text-white">
															{feature.title}
														</h3>
															<p className="text-base/8 text-gray-400">
															{feature.description}
														</p>
													</div>
												)}
											</div>

											<div className="ml-5 md:hidden">
												<h3 className="mb-2 text-xl font-semibold tracking-tight text-white/90">
													{feature.title}
												</h3>
												<p className="text-base/8 text-gray-400">
													{feature.description}
												</p>
											</div>
										</div>
									)
								})}
							</div>
						</div>
					</div>
				</section>

				<section className="relative px-6 py-16 md:py-24 lg:px-8">
					<div className="relative isolate mx-auto max-w-6xl overflow-hidden md:overflow-visible">
						<SectionAura
							mobileClassName="bg-violet-500/8"
							desktopClassName="right-0 top-14 h-52 w-52 bg-violet-500/10"
						/>
						<div className="mb-16">
								<SectionIntro
									align="left"
									title={
										<>
										More than validation.
										<br />
										<span className="text-blue-500 md:whitespace-nowrap">Less broad than generic fraud tools.</span>
										</>
									}
									description="Gatekeepr sits between basic email validation and full signup protection."
								/>
						</div>

						<div className="grid gap-6 md:grid-cols-3">
							{comparisonColumns.map((column) => (
								<div
									key={column.title}
									className={`flex flex-col rounded-xl border p-8 ${
										column.featured
											? "border-blue-500/40 bg-blue-500/5 shadow-[0_0_50px_rgba(37,99,235,0.08)]"
											: "border-white/8 bg-[#0f1525]"
									}`}
								>
									<div className="mb-3 flex items-center gap-2">
										{column.featured && <StarIcon className="size-6 text-blue-400" />}
										<h3 className="text-2xl font-semibold tracking-tight text-white">{column.title}</h3>
									</div>
										<p className="mb-6 text-base/8 text-gray-400">{column.description}</p>
									<ul className="mb-8 flex-1 space-y-3">
										{column.bullets.map((bullet) => (
											<li key={bullet} className="flex items-center gap-2.5">
												<CheckIcon className={`size-4 shrink-0 ${column.featured ? "text-blue-400" : "text-blue-400/90"}`} />
													<span className="text-base/8 text-white">{bullet}</span>
											</li>
										))}
									</ul>
										<p className={`border-t pt-5 text-sm/7 ${
										column.featured ? "border-blue-500/20 text-blue-400" : "border-white/8 text-gray-400"
									}`}>
										{column.footer}
									</p>
								</div>
							))}
						</div>

					</div>
				</section>

				<section className="relative px-6 py-16 md:py-24 lg:px-8">
					<div className="relative isolate mx-auto max-w-6xl overflow-hidden md:overflow-visible">
						<SectionAura
							mobileClassName="bg-blue-600/8"
							desktopClassName="left-8 top-12 h-48 w-48 bg-blue-600/10"
						/>
						<div className="mb-16">
							<SectionIntro
								title="What disposable email detection actually checks"
								description="Gatekeepr analyzes the email signals basic validators miss."
							/>
						</div>

						<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
							{checks.map((feature) => (
								<div
									key={feature.title}
									className="group relative overflow-hidden rounded-xl border border-[#1a2744] bg-[#0c1322] p-7 transition-all duration-300 hover:border-blue-500/30"
								>
									<div className={`absolute pointer-events-none ${feature.glow}`} />
									<div className="relative z-10">
										<div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 transition-colors group-hover:bg-blue-500/15">
											<feature.icon className="size-5 text-blue-400" />
										</div>
										<h3 className="mb-2 text-xl font-semibold tracking-tight text-white">{feature.title}</h3>
										<p className="text-base/8 text-gray-400">{feature.description}</p>
									</div>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="relative px-6 py-16 md:py-24 lg:px-8">
					<div className="relative isolate mx-auto max-w-6xl overflow-hidden md:overflow-visible">
						<SectionAura
							mobileClassName="bg-violet-500/8"
							desktopClassName="right-6 top-16 h-48 w-48 bg-violet-500/10"
						/>
						<div className="mb-16">
							<SectionIntro
								title="Examples of risky email patterns"
								description="These emails may be valid, but they often signal throwaway or low-quality signup intent."
							/>
						</div>

						<div className="mx-auto max-w-4xl space-y-3">
							{patternExamples.map((item) => (
								<div
									key={item.pattern}
									className="flex flex-col gap-3 rounded-xl border border-[#1a2744] bg-[#0c1322] px-5 py-4 transition-all duration-300 hover:border-blue-500/30 md:flex-row md:items-center md:gap-0"
								>
									<div className="flex items-center gap-2.5 md:w-44 md:shrink-0">
										<div className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
										<span className="whitespace-nowrap text-base font-semibold text-white">{item.pattern}</span>
									</div>
									<div className="min-w-0 md:flex-1">
										<code className="inline-block break-all rounded-md bg-blue-500/10 px-3 py-1 text-[13px] text-blue-500">
											{item.example}
										</code>
									</div>
									<p className="shrink-0 text-base/8 text-gray-400 md:whitespace-nowrap md:text-right">
										{item.explanation}
									</p>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="relative px-6 py-16 md:py-24 lg:px-8">
					<div className="relative isolate mx-auto max-w-6xl overflow-hidden md:overflow-visible">
						<SectionAura
							mobileClassName="bg-blue-600/10"
							desktopClassName="-left-10 top-14 h-48 w-48 bg-blue-600/12"
						/>
						<div className="mb-16">
							<SectionIntro
								title={
									<>
								Turn email signals into <span className="text-emerald-600">allow</span>,{" "}
								<span className="text-amber-600">challenge</span>, or{" "}
								<span className="text-rose-600">block</span>
									</>
								}
								description="Not every risky email should be blocked. Some just need more friction before account creation."
							/>
						</div>

						<div className="grid gap-6 md:grid-cols-3">
							{decisions.map((decision) => (
								<div
									key={decision.title}
									className={`rounded-xl border p-8 text-center ${decision.border} ${decision.bg}`}
								>
									<div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${decision.iconBg}`}>
											<decision.icon className={`size-8 ${decision.color}`} />
									</div>
										<h3 className={`mb-3 text-[22px] font-semibold ${decision.color}`}>
											{decision.title}
										</h3>
									<p className="text-base/8 text-gray-300">{decision.description}</p>
								</div>
							))}
						</div>

						<p className="mx-auto mt-10 max-w-2xl text-center text-base/8 text-gray-400">
							This is where email intelligence becomes more useful than validation alone: it helps you respond proportionally, instead of treating every signup the same way.
						</p>
					</div>
				</section>

				<section className="relative px-6 py-16 md:py-24 lg:px-8">
					<div className="relative isolate mx-auto max-w-5xl overflow-hidden md:overflow-visible">
						<SectionAura
							mobileClassName="bg-violet-500/8"
							desktopClassName="right-0 top-8 h-56 w-56 bg-violet-500/10"
						/>
						<div className="mb-16">
							<SectionIntro
								title="Run email intelligence before account creation"
								description="Call Gatekeepr during signup and get a final status with explainability."
							/>
						</div>

						<div className="grid gap-5 md:grid-cols-2">
							<CodeBlock label="Example Request" code={requestCode} variant="request" />
							<CodeBlock label="Example Response" code={responseCode} variant="response" />
						</div>

						<div className="mt-10 text-center">
							<p className="mb-5 text-lg font-medium text-gray-400 sm:text-xl/8">
								One request. One decision. Clear context for your product logic.
							</p>
							<HeroSecondaryLink href="https://docs.gatekeepr.io">
								Explore Docs
							</HeroSecondaryLink>
						</div>
					</div>
				</section>

				<section className="relative px-6 py-16 md:py-24 lg:px-8">
					<div className="relative isolate mx-auto max-w-6xl overflow-hidden md:overflow-visible">
						<SectionAura
							mobileClassName="bg-blue-600/8"
							desktopClassName="left-10 top-10 h-48 w-48 bg-blue-600/10"
						/>
						<div className="mb-16">
							<SectionIntro title="Built for higher-quality signup funnels" />
						</div>

						<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
							{useCases.map((useCase) => (
								<div
									key={useCase.title}
									className="group rounded-xl border border-white/8 bg-gray-950 p-7 transition-all hover:border-blue-500/20"
								>
									<div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 transition-colors group-hover:bg-blue-500/15">
										<useCase.icon className="size-5 text-blue-400" />
									</div>
									<h3 className="mb-2 text-xl font-semibold tracking-tight text-white">{useCase.title}</h3>
									<p className="text-base/8 text-gray-400">{useCase.description}</p>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="relative px-6 py-16 md:py-24 lg:px-8">
					<div className="relative isolate mx-auto max-w-5xl overflow-hidden md:overflow-visible">
						<SectionAura
							mobileClassName="bg-violet-500/8"
							desktopClassName="right-10 top-10 h-52 w-52 bg-violet-500/10"
						/>
						<div className="pointer-events-none absolute -inset-4">
							<div className="absolute left-1/2 top-1/2 h-[22rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/6 blur-[120px]" />
						</div>

						<div className="relative overflow-hidden rounded-2xl border border-[#1a2744] bg-[#0c1322]">
							<div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-linear-to-r from-transparent via-blue-400/40 to-transparent" />
							<div className="px-8 py-14 text-center md:px-16 md:py-20">
								<p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-blue-400">
									Get started
								</p>
								<h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
									Turn email into a real <span className="text-blue-400">signup signal</span>
								</h2>
								<p className="mx-auto mb-10 mt-6 max-w-xl text-base/8 text-gray-400 sm:text-lg/8">
									Detect risky emails in real time and stop fake signups before they create accounts. One API call is all it takes.
								</p>

								<div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
									<HeroPrimaryLink href={session ? "/dashboard" : "/get-free-api-key"}>
										Start Free
									</HeroPrimaryLink>
									<HeroSecondaryLink href="https://docs.gatekeepr.io">
										Explore Docs
									</HeroSecondaryLink>
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="relative px-6 py-16 md:py-24 lg:px-8">
					<div className="relative isolate mx-auto max-w-3xl overflow-hidden md:overflow-visible">
						<SectionAura
							mobileClassName="bg-blue-600/8"
							desktopClassName="-left-8 top-12 h-44 w-44 bg-blue-600/10"
						/>
						<div className="mb-16">
							<SectionIntro title="Frequently asked questions" />
						</div>

						<FaqAccordion items={faqs} />
					</div>
				</section>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
