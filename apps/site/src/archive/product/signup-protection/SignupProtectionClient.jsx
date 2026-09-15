"use client"

import {
	AlertTriangle,
	ArrowRight,
	AtSign,
	BookOpen,
	Bot,
	CheckCircle,
	Eye,
	Globe,
	Mail,
	Monitor,
	ShieldCheck,
	Trash2,
	Users,
	Wifi,
	XCircle,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import SignupFaq from "./SignupFaq"

const impactCards = [
	{
		title: "Wasted free accounts",
		body: "Fake users consume trials, freemium access, and onboarding resources without real intent.",
		color: "#ef4444",
	},
	{
		title: "Inflated signup numbers",
		body: "Top-of-funnel volume looks healthy while actual user quality drops.",
		color: "#f59e0b",
	},
	{
		title: "Polluted activation metrics",
		body: "Bad signups distort activation, conversion, and onboarding data across your product.",
		color: "#8b5cf6",
	},
	{
		title: "Support and infrastructure waste",
		body: "Fake accounts trigger emails, hit your app, and create cleanup work for your team.",
		color: "#3b82f6",
	},
]

const abusePatterns = [
	{
		icon: Trash2,
		title: "Disposable emails",
		body: "Block throwaway addresses before they create low-quality accounts.",
		color: "#ef4444",
	},
	{
		icon: AtSign,
		title: "Suspicious email structure",
		body: "Catch patterns often linked to generated or low-trust signup attempts.",
		color: "#f59e0b",
	},
	{
		icon: Bot,
		title: "Bot signup traffic",
		body: "Detect scripted signups and suspicious client behavior early.",
		color: "#8b5cf6",
	},
	{
		icon: Globe,
		title: "Datacenter, VPN, and Tor traffic",
		body: "Spot infrastructure commonly associated with suspicious signup activity.",
		color: "#3b82f6",
	},
	{
		icon: Users,
		title: "Repeat signups and multi-account abuse",
		body: "Reduce recycled trials, repeated account creation, and freemium abuse.",
		color: "#22c55e",
	},
]

const decisionCards = [
	{
		label: "Allow",
		icon: CheckCircle,
		color: "#22c55e",
		title: "Let legitimate users glide through",
		body: "If the signup looks normal, create the account and keep onboarding friction low.",
	},
	{
		label: "Challenge",
		icon: AlertTriangle,
		color: "#f59e0b",
		title: "Add friction only to suspicious signups",
		body: "Trigger email verification, temporary friction, or manual review for traffic that looks risky but not clearly abusive.",
	},
	{
		label: "Block",
		icon: XCircle,
		color: "#ef4444",
		title: "Stop clear abuse at the door",
		body: "Reject signups that show strong signs of disposable email abuse, automation, or suspicious infrastructure.",
	},
]

const comparisons = [
	{
		title: "CAPTCHA-only",
		text1: "Basic bot friction",
		text2: "Disposable emails, repeat signups, and signup quality",
		highlighted: false,
	},
	{
		title: "Email-validation-only",
		text1: "Checking email format or validity",
		text2: "IP reputation, suspicious infrastructure, and request context",
		highlighted: false,
	},
	{
		title: "Gatekeepr",
		text1: "Protecting the signup flow with multi-signal decisions",
		text2: "Real-time allow, challenge, or block decisions with explainable signals",
		highlighted: true,
	},
]

const useCases = [
	{
		title: "Free-trial signup protection",
		body: "Reduce repeat signups, disposable emails, and low-intent trial abuse before accounts are created.",
	},
	{
		title: "Freemium abuse prevention",
		body: "Stop fake users from consuming product resources without real product intent.",
	},
	{
		title: "Waitlist protection",
		body: "Keep launch and beta lists cleaner by filtering suspicious signups early.",
	},
	{
		title: "Self-serve SaaS onboarding",
		body: "Protect onboarding without adding unnecessary friction for legitimate users.",
	},
	{
		title: "B2B signup quality control",
		body: "Improve account quality when signup intent matters more than raw signup volume.",
	},
]

const faqs = [
	{
		question: "What data does Gatekeepr need to evaluate a signup?",
		answer: "Gatekeepr uses the core signals already available in most signup flows: email, IP, and user agent. That keeps the integration lightweight while still giving you strong coverage for signup fraud prevention and account creation abuse.",
	},
	{
		question: "What does challenge mean in practice?",
		answer: "Challenge means the signup looks suspicious, but not suspicious enough to block immediately. You can use it to trigger email verification, temporary friction, or manual review without slowing down every user.",
	},
	{
		question: "Can I use Gatekeepr with my existing backend or auth flow?",
		answer: "Yes. Gatekeepr is built to plug into existing signup flows. Make the API call from your backend, inspect the result, and decide whether to allow, challenge, or block before account creation completes.",
	},
	{
		question: "Can I run Gatekeepr in shadow mode before blocking users?",
		answer: "Yes. You can log decisions first, review how Gatekeepr classifies signup traffic, and move to enforcement later.",
	},
]

const requestCode = `POST /v1/signup/check
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "email": "user@example.com",
  "ip": "203.0.113.42",
  "user_agent": "Mozilla/5.0 ..."
}`

const responseCode = `{
  "status": "challenge",
  "threats": [
    "disposable_email",
    "datacenter_ip"
  ],
  "trust_signals": [
    "valid_email_syntax"
  ],
  "blocklists": [
    "known_disposable_provider"
  ],
  "info": {
    "email_domain": "examplemail.co",
    "network_type": "datacenter",
    "recommended_action": "require_email_verification"
  }
}`

function SectionLabel({ children }) {
	return (
		<p
			className="mb-4 text-blue-500"
			style={{
				fontSize: 13,
				fontWeight: 600,
				textTransform: "uppercase",
				letterSpacing: "0.12em",
			}}
		>
			{children}
		</p>
	)
}

function SectionH2({ children, className = "" }) {
	return (
		<h2
			className={`text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl lg:text-[3.1rem]/[1.04] ${className}`}
		>
			{children}
		</h2>
	)
}

function CodeBlock({ label, code, highlighted }) {
	return (
		<div className="overflow-hidden rounded-xl border border-[#1a2744]/60 bg-[#060a14]">
			<div className="flex items-center gap-2 border-b border-[#1a2744]/60 bg-[#0a0f1c] px-4 py-2.5">
				<div className="flex gap-1.5">
					<div className="h-2.5 w-2.5 rounded-full bg-[#ef4444]/50" />
					<div className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]/50" />
					<div className="h-2.5 w-2.5 rounded-full bg-[#22c55e]/50" />
				</div>
				<span
					className="ml-2 text-gray-500"
					style={{ fontSize: 12, fontWeight: 500 }}
				>
					{label}
				</span>
			</div>
			<pre className="overflow-x-auto p-5">
				<code
					style={{
						fontSize: 13,
						lineHeight: 1.7,
						fontFamily: "'JetBrains Mono', monospace",
					}}
				>
					{highlighted ? (
						<HighlightedJSON code={code} />
					) : (
						<span className="text-gray-400">{code}</span>
					)}
				</code>
			</pre>
		</div>
	)
}

function HighlightedJSON({ code }) {
	return code.split("\n").map((line, index) => {
		if(line.includes("\"status\"")) {
			return (
				<div key={index}>
					<span className="text-gray-500">  </span>
					<span className="text-[#60a5fa]">&quot;status&quot;</span>
					<span className="text-gray-500">: </span>
					<span className="text-[#f59e0b]">&quot;challenge&quot;</span>
					<span className="text-gray-500">,</span>
				</div>
			)
		}
		if(line.includes("\"disposable_email\"")) {
			return (
				<div key={index}>
					<span className="text-gray-500">    </span>
					<span className="text-[#ef4444]">&quot;disposable_email&quot;</span>
					<span className="text-gray-500">,</span>
				</div>
			)
		}
		if(line.includes("\"datacenter_ip\"")) {
			return (
				<div key={index}>
					<span className="text-gray-500">    </span>
					<span className="text-[#ef4444]">&quot;datacenter_ip&quot;</span>
				</div>
			)
		}
		if(line.includes("\"valid_email_syntax\"")) {
			return (
				<div key={index}>
					<span className="text-gray-500">    </span>
					<span className="text-[#22c55e]">&quot;valid_email_syntax&quot;</span>
				</div>
			)
		}
		if(line.includes("\"require_email_verification\"")) {
			return (
				<div key={index}>
					<span className="text-gray-500">    </span>
					<span className="text-[#60a5fa]">&quot;recommended_action&quot;</span>
					<span className="text-gray-500">: </span>
					<span className="text-[#f59e0b]">&quot;require_email_verification&quot;</span>
				</div>
			)
		}
		return (
			<div key={index} className="text-gray-400">
				{line}
			</div>
		)
	})
}

export default function SignupProtectionClient({ primaryHref }) {
	const [activeTab, setActiveTab] = useState("request")

	return (
		<div className="pb-20 md:pb-28">
			<section className="relative overflow-hidden pb-20 pt-32 md:pb-28 md:pt-40">
				<div className="absolute inset-0 pointer-events-none">
					<div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-blue-600/8 blur-[120px]" />
				</div>

				<div className="relative z-10 mx-auto w-full max-w-7xl px-6 lg:px-8">
					<div className="grid items-center gap-12 md:grid-cols-2 md:gap-16 lg:gap-x-8">
						<div className="mx-auto max-w-3xl lg:mx-0 lg:w-full lg:px-0">
							<div className="max-w-[46rem]">
							<div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-blue-600/20 bg-blue-600/5 px-4 py-1.5">
								<ShieldCheck className="h-3.5 w-3.5 text-blue-500" strokeWidth={2} />
								<span className="text-sm font-semibold text-blue-500">
									Signup Protection
								</span>
							</div>

							<h1 className="mb-3 text-5xl font-bold tracking-tight text-pretty text-white sm:text-6xl">
								<span className="hidden md:inline whitespace-nowrap">Protect your signup flow</span>
								<span className="md:hidden">Protect your signup flow</span>
								<br className="hidden md:block" />{" "}
								<span className="text-white">from </span>
								<span className="bg-linear-to-r from-blue-600 to-[#60a5fa] bg-clip-text text-transparent">
									fake accounts
								</span>
							</h1>

							<p className="mb-2 whitespace-nowrap text-xl font-medium text-pretty text-white sm:text-2xl/8">
								One API call. One decision. Before account creation.
							</p>

							<p className="mb-8 text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
								Send the signup data you already collect, and Gatekeepr returns
								<br className="hidden md:block" /> a clear decision your product can use instantly:{" "}
								<span className="font-semibold text-[#22c55e]">allow</span>,{" "}
								<span className="font-semibold text-[#f59e0b]">challenge</span>, or{" "}
								<span className="font-semibold text-[#ef4444]">block</span>.
							</p>

							<div className="flex flex-col items-start gap-3 sm:flex-row">
								<Link
									href={primaryHref}
									className="inline-flex h-[47px] items-center gap-2 rounded-lg bg-blue-600 px-7 text-base font-semibold text-white transition-all hover:bg-blue-600/90 hover:shadow-[0_0_30px_rgba(37,99,235,0.3)]"
								>
									Start Free <ArrowRight className="h-4 w-4" strokeWidth={2} />
								</Link>
								<Link
									href="https://docs.gatekeepr.io"
									className="inline-flex h-[47px] items-center gap-2 rounded-lg border border-[#1a2744] px-7 text-base font-medium text-white transition-colors hover:border-gray-400/30"
								>
									<BookOpen className="h-4 w-4" strokeWidth={2} /> View API Docs
								</Link>
							</div>
							</div>
						</div>

						<div className="relative w-full md:mx-auto md:max-w-lg lg:mx-0 lg:max-w-none">
							<div className="pointer-events-none absolute -inset-4">
								<div className="absolute left-1/2 top-1/2 h-[300px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/6 blur-[80px]" />
							</div>

							<div className="relative ml-auto w-full max-w-[380px] space-y-2">
								<div className="rounded-lg border border-[#1a2744]/60 bg-[#0c1322] px-4 py-3">
									<p className="mb-2 text-gray-500" style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
										Input
									</p>
									<div className="space-y-1.5">
										{[
											{ icon: Mail, label: "Email", value: "user@example.com", color: "#3b82f6" },
											{ icon: Wifi, label: "IP", value: "203.0.113.42", color: "#f59e0b" },
											{ icon: Monitor, label: "User agent", value: "Mozilla/5.0 ...", color: "#8b5cf6" },
										].map((field) => (
											<div key={field.label} className="flex items-center gap-2.5 rounded-md border border-[#1a2744]/40 bg-[#0f1525] px-2.5 py-1.5">
												<field.icon className="h-3 w-3 shrink-0" style={{ color: field.color }} strokeWidth={2} />
												<span className="shrink-0 text-gray-500" style={{ fontSize: 11, fontWeight: 600 }}>
													{field.label}
												</span>
												<span className="ml-auto truncate text-white/70" style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
													{field.value}
												</span>
											</div>
										))}
									</div>
								</div>

								<div className="rounded-lg border border-[#f59e0b]/20 bg-[#0c1322] px-4 py-3">
									<p className="mb-1.5 text-gray-500" style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
										Decision
									</p>
									<div className="mb-1 flex items-center gap-2.5">
										<div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#f59e0b]/20 bg-[#f59e0b]/10">
											<AlertTriangle className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} strokeWidth={2} />
										</div>
										<span className="text-[#f59e0b]" style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
											Challenge
										</span>
									</div>
									<p className="text-gray-400" style={{ fontSize: 12, lineHeight: 1.5 }}>
										Suspicious signup detected. Require email verification before account creation.
									</p>
								</div>

								<div className="rounded-lg border border-[#1a2744]/60 bg-[#0c1322] px-4 py-3">
									<p className="mb-2 text-gray-500" style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
										Signals
									</p>
									<div className="space-y-2">
										<div>
											<p className="mb-1 text-[#ef4444]/70" style={{ fontSize: 10, fontWeight: 600 }}>
												Threats
											</p>
											<div className="flex flex-wrap gap-1.5">
												{["Disposable email", "Datacenter IP"].map((item) => (
													<span key={item} className="rounded border border-[#ef4444]/15 bg-[#ef4444]/8 px-2 py-0.5 text-[#ef4444]" style={{ fontSize: 11, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>
														{item}
													</span>
												))}
											</div>
										</div>
										<div>
											<p className="mb-1 text-[#22c55e]/70" style={{ fontSize: 10, fontWeight: 600 }}>
												Trust signals
											</p>
											<span className="rounded border border-[#22c55e]/15 bg-[#22c55e]/8 px-2 py-0.5 text-[#22c55e]" style={{ fontSize: 11, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>
												Valid email syntax
											</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="px-6 py-20 md:py-28">
				<div className="mx-auto max-w-5xl">
					<div className="grid items-start gap-14 md:grid-cols-[1fr,1.2fr]">
						<div>
							<SectionLabel>Why it matters</SectionLabel>
							<SectionH2 className="mb-5">Fake signups become a growth tax fast</SectionH2>
							<p className="text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
								Bad accounts do more than create noise. They waste free accounts, distort funnel metrics, and add cost before you even realize they should not exist.
							</p>
						</div>

						<div className="grid grid-cols-2 gap-5">
							{impactCards.map((card, index) => (
								<div key={card.title} className="flex gap-4 px-5 py-5">
									<span className="mt-0.5 shrink-0" style={{ fontSize: 32, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1, color: card.color, opacity: 0.35 }}>
										{String(index + 1).padStart(2, "0")}
									</span>
									<div>
										<h3 className="mb-1.5 text-white" style={{ fontSize: 17, fontWeight: 600 }}>
											{card.title}
										</h3>
										<p className="text-gray-400" style={{ fontSize: 15, lineHeight: 1.7 }}>
											{card.body}
										</p>
									</div>
								</div>
							))}
							<p className="border-t border-blue-600/20 pt-6 text-gray-400" style={{ fontSize: 14, lineHeight: 1.7, fontStyle: "italic" }}>
								The best time to stop signup abuse is before the account gets created.
							</p>
						</div>
					</div>
				</div>
			</section>

			<section className="bg-white/[0.03] px-6 py-20 md:py-28">
				<div className="mx-auto max-w-5xl">
					<div className="grid items-start gap-14 md:grid-cols-[1fr,1.4fr]">
						<div>
							<SectionLabel>What teams are dealing with</SectionLabel>
							<SectionH2 className="mb-4">Common abuse patterns at signup</SectionH2>
							<p className="text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
								Gatekeepr is built to catch the patterns that show up most often in fake signup protection and account creation abuse.
							</p>
						</div>

						<div className="space-y-3">
							{abusePatterns.map((pattern) => (
								<div key={pattern.title} className="relative rounded-r-lg py-4 pl-5 pr-5" style={{ backgroundColor: `${pattern.color}05` }}>
									<div className="absolute bottom-0 left-0 top-0 w-[3px] rounded-full" style={{ backgroundColor: pattern.color }} />
									<div className="flex items-start gap-4">
										<pattern.icon className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ color: pattern.color }} />
										<div>
											<h3 className="mb-0.5 text-white" style={{ fontSize: 15, fontWeight: 600 }}>
												{pattern.title}
											</h3>
											<p className="text-gray-400" style={{ fontSize: 14, lineHeight: 1.6 }}>
												{pattern.body}
											</p>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="px-6 py-20 md:py-28">
				<div className="mx-auto max-w-5xl">
					<div className="mb-16 text-center">
						<SectionLabel>How it works</SectionLabel>
						<SectionH2 className="mb-4">What Gatekeepr checks during signup</SectionH2>
						<p className="mx-auto mt-5 max-w-2xl text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
							Gatekeepr evaluates the signals your product already collects and turns them into one clear decision.
						</p>
					</div>

					<div className="mb-20 grid items-center gap-10 md:mb-28 md:grid-cols-2 md:gap-14">
						<div>
							<div className="mb-5 flex items-center gap-3">
								<span className="text-blue-600/30" style={{ fontSize: 48, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
									01
								</span>
								<div className="h-px flex-1 bg-blue-600/10" />
							</div>
							<h3 className="mb-3 text-white" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
								Send the signup data you already have
							</h3>
							<p className="mb-4 text-gray-400" style={{ fontSize: 16, lineHeight: 1.7 }}>
								Pass the email, IP, and user agent from your existing signup flow. No SDK, no frontend changes — one POST request from your backend.
							</p>
							<ul className="space-y-2.5">
								{["No new fields for users to fill", "Works with any auth stack", "Under 5 minutes to integrate"].map((item) => (
									<li key={item} className="flex items-center gap-2.5">
										<CheckCircle className="h-5 w-5 shrink-0 text-blue-500" strokeWidth={2} />
										<span className="text-white/80" style={{ fontSize: 14, lineHeight: 1.6 }}>
											{item}
										</span>
									</li>
								))}
							</ul>
						</div>
						<div>
							<CodeBlock label="POST /v1/signup/check" code={requestCode} />
						</div>
					</div>

					<div className="mb-20 grid items-center gap-10 md:mb-28 md:grid-cols-2 md:gap-14">
						<div className="grid grid-cols-2 gap-3 md:order-1">
							{[
								{ icon: Mail, label: "Disposable email", detail: "Throwaway provider detected", color: "#ef4444" },
								{ icon: Globe, label: "Datacenter IP", detail: "Non-residential infrastructure", color: "#f59e0b" },
								{ icon: Bot, label: "Bot pattern", detail: "Scripted signup behavior", color: "#8b5cf6" },
								{ icon: AtSign, label: "Email structure", detail: "Suspicious formatting signals", color: "#3b82f6" },
							].map((item) => (
								<div key={item.label} className="flex flex-col gap-2.5 rounded-lg border border-[#1a2744]/60 bg-[#0c1322] p-4">
									<div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${item.color}10`, border: `1px solid ${item.color}20` }}>
										<item.icon className="h-4 w-4" style={{ color: item.color }} strokeWidth={2} />
									</div>
									<div>
										<p className="text-white" style={{ fontSize: 13, fontWeight: 600 }}>
											{item.label}
										</p>
										<p className="text-gray-400" style={{ fontSize: 12, lineHeight: 1.5 }}>
											{item.detail}
										</p>
									</div>
								</div>
							))}
						</div>
						<div className="md:order-2">
							<div className="mb-5 flex items-center gap-3">
								<span className="text-blue-600/30" style={{ fontSize: 48, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
									02
								</span>
								<div className="h-px flex-1 bg-blue-600/10" />
							</div>
							<h3 className="mb-3 text-white" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
								Gatekeepr checks the signals bad signups leave behind
							</h3>
							<p className="mb-4 text-gray-400" style={{ fontSize: 16, lineHeight: 1.7 }}>
								Every signup is evaluated across email reputation, IP infrastructure, blocklists, and request-level context — not just one signal in isolation.
							</p>
							<p className="text-gray-400" style={{ fontSize: 15, lineHeight: 1.7 }}>
								Instead of relying on one weak signal, Gatekeepr evaluates email, network, and request context together.
							</p>
						</div>
					</div>

					<div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
						<div>
							<div className="mb-5 flex items-center gap-3">
								<span className="text-blue-600/30" style={{ fontSize: 48, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
									03
								</span>
								<div className="h-px flex-1 bg-blue-600/10" />
							</div>
							<h3 className="mb-3 text-white" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
								Get a decision your backend can act on
							</h3>
							<p className="mb-4 text-gray-400" style={{ fontSize: 16, lineHeight: 1.7 }}>
								Gatekeepr returns a single decision — allow, challenge, or block — with the signals behind it. Your product logic stays in your hands.
							</p>
							<ul className="space-y-2.5">
								{["Explainable signals, not a black-box score", "Shadow mode for safe rollout", "Act on the decision in your own flow"].map((item) => (
									<li key={item} className="flex items-center gap-2.5">
										<CheckCircle className="h-5 w-5 shrink-0 text-blue-500" strokeWidth={2} />
										<span className="text-white/80" style={{ fontSize: 14, lineHeight: 1.6 }}>
											{item}
										</span>
									</li>
								))}
							</ul>
						</div>
						<div className="overflow-hidden rounded-xl border border-[#1a2744]/60 bg-[#0c1322]">
							<div className="border-b border-[#1a2744]/40 px-5 py-3">
								<p className="text-gray-500" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
									Decision
								</p>
							</div>
							<div className="space-y-3 p-5">
								{decisionCards.map((card) => (
									<div key={card.label} className="flex items-center gap-3 rounded-lg px-4 py-3" style={{ backgroundColor: `${card.color}06`, border: `1px solid ${card.color}12` }}>
										<card.icon className="h-5 w-5 shrink-0" style={{ color: card.color }} />
										<div className="min-w-0 flex-1">
											<span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: card.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
												{card.label}
											</span>
											<span className="ml-2 text-gray-400" style={{ fontSize: 13 }}>
												— {card.title}
											</span>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="bg-white/[0.03] px-6 py-20 md:py-28">
				<div className="mx-auto max-w-4xl">
						<div className="mb-14 text-center">
							<SectionLabel>Decisioning</SectionLabel>
							<SectionH2 className="mb-4">
								<span className="text-[#22c55e]">Allow</span>, <span className="text-[#f59e0b]">challenge</span>, or <span className="text-[#ef4444]">block</span>
							</SectionH2>
							<p className="mx-auto mt-5 max-w-2xl text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
								Keep good users moving, apply friction only when needed, and stop obvious abuse before account creation.
							</p>
						</div>

					<div className="overflow-hidden rounded-xl border border-[#1a2744]/60">
						{decisionCards.map((card, index) => (
							<div key={card.label} className={`flex items-start gap-5 p-6 md:px-8 ${index < decisionCards.length - 1 ? "border-b border-[#1a2744]/40" : ""}`} style={{ backgroundColor: `${card.color}04` }}>
								<div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${card.color}12`, border: `1px solid ${card.color}20` }}>
									<card.icon className="h-5 w-5" style={{ color: card.color }} />
								</div>
								<div className="min-w-0 flex-1">
									<div className="mb-1 flex flex-wrap items-baseline gap-2">
										<span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: card.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
											{card.label}
										</span>
										<span className="text-white" style={{ fontSize: 15, fontWeight: 600 }}>
											— {card.title}
										</span>
									</div>
									<p className="text-gray-400" style={{ fontSize: 14, lineHeight: 1.7 }}>
										{card.body}
									</p>
								</div>
							</div>
						))}
					</div>

					<div className="mt-8 flex items-start gap-4 rounded-lg border border-blue-600/15 bg-blue-600/[0.03] px-6 py-5">
						<Eye className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" strokeWidth={2} />
						<div>
							<span className="text-white" style={{ fontSize: 15, fontWeight: 600 }}>
								Start in shadow mode first.
							</span>{" "}
							<span className="text-gray-400" style={{ fontSize: 15, lineHeight: 1.7 }}>
								Log Gatekeepr decisions in your signup flow, review threats and trust signals, and switch to enforcement when you are ready.
							</span>
						</div>
					</div>
				</div>
			</section>

			<section className="px-6 py-20 md:py-28">
				<div className="mx-auto max-w-4xl">
						<div className="mb-14 text-center">
							<SectionLabel>Why this approach</SectionLabel>
							<SectionH2 className="mb-4">More complete than CAPTCHA-only or email-validation-only approaches</SectionH2>
							<p className="mx-auto mt-5 max-w-2xl text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
								Useful tools solve part of the problem. Signup fraud prevention needs a broader view of the request.
							</p>
						</div>

					<div className="-mx-2 overflow-x-auto">
						<table className="min-w-[560px] w-full border-collapse" style={{ fontSize: 14 }}>
							<thead>
								<tr className="border-b border-[#1a2744]/60">
									<th className="w-24 py-3 pr-4 text-left" />
									{comparisons.map((item) => (
										<th key={item.title} className={`px-5 py-3 text-left ${item.highlighted ? "text-blue-500" : "text-white"}`} style={{ fontSize: 16, fontWeight: 700 }}>
											{item.title}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								<tr className="border-b border-[#1a2744]/30">
									<td className="align-top whitespace-nowrap py-4 pr-4 text-gray-500" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
										Strength
									</td>
									{comparisons.map((item) => (
										<td key={item.title} className={`align-top px-5 py-4 ${item.highlighted ? "text-white" : "text-white/70"}`} style={{ fontSize: 14, lineHeight: 1.6 }}>
											{item.text1}
										</td>
									))}
								</tr>
								<tr>
									<td className="align-top whitespace-nowrap py-4 pr-4 text-gray-500" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
										Coverage
									</td>
									{comparisons.map((item) => (
										<td key={item.title} className={`align-top px-5 py-4 ${item.highlighted ? "text-white" : "text-white/70"}`} style={{ fontSize: 14, lineHeight: 1.6 }}>
											{item.text2}
										</td>
									))}
								</tr>
							</tbody>
						</table>
					</div>

					<p className="mx-auto mt-10 max-w-2xl text-center text-gray-400" style={{ fontSize: 15, lineHeight: 1.7 }}>
						Use CAPTCHA where it helps. Use email validation where it helps. Use Gatekeepr when you need to protect the signup flow itself.
					</p>
				</div>
			</section>

			<section className="bg-white/[0.03] px-6 py-20 md:py-28">
				<div className="mx-auto max-w-5xl">
					<div className="grid items-start gap-10 md:grid-cols-2 md:gap-14">
						<div>
							<SectionLabel>Developer experience</SectionLabel>
							<SectionH2 className="mb-4">One API call in your signup flow</SectionH2>
							<p className="mb-8 text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
								Send the core signup signals you already collect. Get a real-time decision your backend can act on immediately.
							</p>

							<ul className="mb-8 space-y-4">
								{[
									"Send email, IP, and user agent",
									"Get allow, challenge, or block in real time",
									"Inspect threats, trust signals, and blocklists",
									"Roll out in shadow mode before enforcement",
								].map((item) => (
									<li key={item} className="flex items-center gap-3">
										<CheckCircle className="h-5 w-5 shrink-0 text-blue-500" strokeWidth={2} />
										<span className="text-white/90" style={{ fontSize: 15, lineHeight: 1.6 }}>
											{item}
										</span>
									</li>
								))}
							</ul>
						</div>

						<div>
							<div className="mb-3 flex gap-1">
								{["request", "response"].map((tab) => (
									<button
										key={tab}
										type="button"
										onClick={() => setActiveTab(tab)}
										className={`cursor-pointer rounded-lg px-4 py-2 transition-colors ${
											activeTab === tab
												? "border border-blue-600/20 bg-blue-600/10 text-blue-500"
												: "border border-transparent text-gray-500 hover:text-white"
										}`}
										style={{ fontSize: 13, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}
									>
										{tab.charAt(0).toUpperCase() + tab.slice(1)}
									</button>
								))}
							</div>
							<CodeBlock
								label={activeTab === "request" ? "Request" : "Response"}
								code={activeTab === "request" ? requestCode : responseCode}
								highlighted={activeTab === "response"}
							/>
						</div>
					</div>
				</div>
			</section>

			<section className="px-6 py-20 md:py-28">
				<div className="mx-auto max-w-4xl">
						<div className="mb-10 text-center">
							<SectionLabel>Use cases</SectionLabel>
							<SectionH2 className="mb-4">Built for SaaS signup flows with abuse risk</SectionH2>
							<p className="mx-auto mt-5 max-w-2xl text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
								Gatekeepr fits anywhere account creation quality matters.
							</p>
						</div>

					<div className="mx-auto grid max-w-3xl gap-x-12 gap-y-6 sm:grid-cols-2">
						{useCases.map((item) => (
							<div key={item.title} className="flex items-start gap-3">
								<div className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
								<div>
									<h3 className="mb-1 text-white" style={{ fontSize: 15, fontWeight: 600 }}>
										{item.title}
									</h3>
									<p className="text-gray-400" style={{ fontSize: 14, lineHeight: 1.6 }}>
										{item.body}
									</p>
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="bg-white/[0.03] px-6 py-20 md:py-28">
				<div className="mx-auto max-w-3xl">
					<div className="mb-14 text-center">
						<SectionLabel>FAQ</SectionLabel>
						<SectionH2>Questions teams ask before rollout</SectionH2>
					</div>

					<SignupFaq items={faqs} />
				</div>
			</section>

			<section className="px-6 py-20 md:py-28">
				<div className="relative mx-auto max-w-5xl">
					<div className="pointer-events-none absolute -inset-4">
						<div className="absolute left-1/2 top-1/2 h-[350px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/6 blur-[120px]" />
					</div>

					<div className="relative overflow-hidden rounded-2xl border border-[#1a2744] bg-[#0c1322]">
						<div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-blue-600/40 to-transparent" />

						<div className="relative z-10 px-8 py-14 text-center md:px-16 md:py-20">
							<p className="mb-5 uppercase tracking-widest text-blue-500" style={{ fontSize: 12, fontWeight: 600 }}>
								Ready to protect your signup flow?
							</p>

							<h2 className="mb-5 text-white" style={{ fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em" }}>
								Stop fake signups before they become <span className="text-blue-500">product noise</span>
							</h2>

							<p className="mx-auto mb-10 max-w-xl text-gray-400" style={{ fontSize: 16, lineHeight: 1.7 }}>
								Block disposable emails, challenge suspicious traffic, and keep legitimate users moving with one simple API.
							</p>

							<div className="mb-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
								<Link
									href={primaryHref}
									className="inline-flex h-[47px] items-center gap-2 rounded-lg bg-blue-600 px-7 text-base font-semibold text-white transition-all hover:bg-blue-600/90 hover:shadow-[0_0_30px_rgba(37,99,235,0.3)]"
								>
									Start Free <ArrowRight className="h-4 w-4" strokeWidth={2} />
								</Link>
								<Link
									href="https://docs.gatekeepr.io"
									className="inline-flex h-[47px] items-center gap-2 rounded-lg border border-[#1a2744] px-7 text-base font-medium text-white transition-colors hover:border-gray-400/30"
								>
									<BookOpen className="h-4 w-4" strokeWidth={2} /> View API Docs
								</Link>
							</div>

							<p className="text-gray-400" style={{ fontSize: 14 }}>
								<Link href="/product/email-intelligence" className="text-blue-500 hover:underline">
									Email Intelligence
								</Link>
								{" · "}
								<Link href="/product/free-trial-abuse-prevention" className="text-blue-500 hover:underline">
									Free-Trial Abuse Prevention
								</Link>
								{" · "}
								<Link href="/how-it-works" className="text-blue-500 hover:underline">
									How It Works
								</Link>
								{" · "}
								<Link href="/#pricing" className="text-blue-500 hover:underline">
									Pricing
								</Link>
							</p>
						</div>
					</div>
				</div>
			</section>
		</div>
	)
}
