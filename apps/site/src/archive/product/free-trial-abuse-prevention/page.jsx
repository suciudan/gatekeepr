import clsx from "clsx"
import {
	ArrowRightIcon,
	BookOpenIcon,
	ChartBarSquareIcon,
	CheckCircleIcon,
	EnvelopeIcon,
	ExclamationTriangleIcon,
	NoSymbolIcon,
	ServerStackIcon,
	ShieldCheckIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline"
import Link from "next/link"

import Footer from "@/components/Footer"
import Header from "@/components/Header"
import Section from "@/components/Section"
import { isUserLoggedIn } from "@/libs/user"

export const metadata = {
	title: "Free-Trial Abuse Prevention for SaaS | Gatekeepr",
	description: "Stop repeat signups, disposable emails, and multi-account abuse before they drain your free plan. Gatekeepr returns a clear allow, challenge, or block decision in real time.",
	alternates: {
		canonical: "/product/free-trial-abuse-prevention",
	},
}

const painCards = [
	{
		title: "Wasted free credits",
		description: "Repeat signups and fake users consume trial credits, onboarding perks, and free usage meant for real prospects.",
		icon: NoSymbolIcon,
	},
	{
		title: "Higher infrastructure cost",
		description: "For AI and usage-based products, abusive signups can trigger compute, storage, API, and email costs immediately.",
		icon: ServerStackIcon,
	},
	{
		title: "Polluted product analytics",
		description: "Fake accounts skew activation, conversion, and top-of-funnel performance, making growth decisions less reliable.",
		icon: ChartBarSquareIcon,
	},
	{
		title: "More support noise",
		description: "Abusive self-serve signups create extra tickets, edge cases, and operational cleanup your team should not have to handle.",
		icon: EnvelopeIcon,
	},
]

const abusePatterns = [
	{
		title: "Disposable emails",
		description: "Throwaway inboxes used to reset access and avoid long-term identity.",
	},
	{
		title: "Repeat signups",
		description: "The same person creating multiple accounts to reclaim free trials or credits.",
	},
	{
		title: "VPN, Tor, and anonymous IPs",
		description: "Traffic routed through anonymous networks to hide origin and scale account creation.",
	},
	{
		title: "Suspicious email structure",
		description: "Low-trust email patterns that often appear in automated or abusive signups.",
	},
	{
		title: "Multi-account abuse",
		description: "One user generating multiple identities to exploit freemium limits, waitlists, or onboarding incentives.",
	},
]

const defenseComparisons = [
	{
		title: "CAPTCHA-only",
		description: "Useful against simple automation, but weak against repeat trial users, manual abuse, and multi-account signups.",
	},
	{
		title: "Basic email validation",
		description: "Checks if an email looks valid or deliverable, but does not help decide whether the signup should be allowed, challenged, or blocked.",
	},
	{
		title: "Manual review",
		description: "Slow, inconsistent, and expensive. It adds friction after abuse has already entered the funnel.",
	},
]

const decisions = [
	{
		title: "Allow",
		description: "The signup looks legitimate. Let the user continue with no added friction.",
		className: "border-emerald-400/20 bg-emerald-500/8 text-emerald-200",
		icon: CheckCircleIcon,
	},
	{
		title: "Challenge",
		description: "The signup looks suspicious. Add step-up verification, require email confirmation, or apply extra friction before access is granted.",
		className: "border-amber-400/25 bg-amber-500/10 text-amber-200",
		icon: ExclamationTriangleIcon,
	},
	{
		title: "Block",
		description: "The signup should be rejected before the account is created.",
		className: "border-rose-400/20 bg-rose-500/8 text-rose-200",
		icon: NoSymbolIcon,
	},
]

const policies = [
	{
		title: "Allow → Continue signup",
		description: "Create the account and let legitimate users move through the flow normally.",
	},
	{
		title: "Challenge → Verify or add friction",
		description: "Require email verification, slow down access to free credits, or route the signup into a lightweight review step.",
	},
	{
		title: "Block → Reject signup",
		description: "Stop obvious abuse before an account, workspace, or trial is created.",
	},
]

const useCases = [
	{
		title: "Free trials",
		description: "Stop users from resetting trial access through repeat signups.",
	},
	{
		title: "Free credits",
		description: "Prevent bad users from farming usage-based credits across multiple accounts.",
	},
	{
		title: "Freemium products",
		description: "Reduce fake accounts that inflate user numbers but never convert.",
	},
	{
		title: "Abuse-prone waitlists",
		description: "Keep bots and duplicates from corrupting waitlist quality and launch signals.",
	},
	{
		title: "AI products",
		description: "Protect expensive free usage before abusive accounts trigger model or infrastructure cost.",
	},
	{
		title: "Self-serve SaaS onboarding",
		description: "Keep real users moving while stopping trial farming before resources are provisioned.",
	},
]

const faqs = [
	{
		question: "What data does Gatekeepr need to evaluate a trial signup?",
		answer: "Gatekeepr uses the signals already available at signup: email, IP, and user agent. From those inputs, it returns allow, challenge, or block, along with threats, trust signals, blocklists, and supporting info.",
	},
	{
		question: "What does challenge mean for a suspicious signup?",
		answer: "Challenge means the signup should not be treated as a normal pass. You can require email verification, add extra friction before granting free access, or send the signup through a lightweight review step.",
	},
	{
		question: "Can I run Gatekeepr in shadow mode before blocking users?",
		answer: "Yes. Teams can start in monitor mode, observe decisions in production, and turn on enforcement later. This makes rollout safer and easier to tune operationally.",
	},
	{
		question: "How is this different from basic email validation?",
		answer: "Basic email validation checks whether an address looks valid. Gatekeepr is built for free trial abuse prevention by evaluating signup context and returning a usable decision that helps stop repeat signups, disposable emails, and multi-account abuse.",
	},
]

const baseCardClassName = clsx(
	"relative overflow-hidden rounded-3xl border p-6 sm:p-8",
	"border-white/8 bg-cinder-950/80 shadow-[0_20px_60px_rgba(0,0,0,0.35)]",
	"ring-1 ring-white/5"
)

function SectionIntro({ eyebrow, title, description, align = "left" }) {
	return (
		<div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-4xl"}>
			{eyebrow && (
				<div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-blue-300">
					{eyebrow}
				</div>
			)}
			<h2 className="mt-6 text-3xl font-semibold tracking-tight text-pretty text-white sm:text-4xl lg:text-5xl">
				{title}
			</h2>
			<p className="mt-6 max-w-3xl text-base/7 text-gray-400 sm:text-lg/8">
				{description}
			</p>
		</div>
	)
}

function PrimaryLink({ href, children }) {
	return (
		<Link
			href={href}
			className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-7 py-3 text-[15px] font-semibold text-white transition-all hover:bg-blue-500 sm:w-auto"
		>
			{children}
			<ArrowRightIcon className="size-4" />
		</Link>
	)
}

function SecondaryLink({ href, children }) {
	return (
		<Link
			href={href}
			className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#1a2744] px-7 py-3 text-[15px] font-medium text-white transition-all hover:border-blue-400/50 sm:w-auto"
		>
			<BookOpenIcon className="size-4 shrink-0" />
			{children}
		</Link>
	)
}

function SignupDecisionCard() {
	return (
		<div className="relative">
			<div className="absolute -left-10 top-8 -z-10 h-44 w-44 rounded-full bg-blue-600/14 blur-3xl" />
			<div className="absolute right-0 top-28 -z-10 h-56 w-56 rounded-full bg-violet-500/12 blur-3xl" />
			<div className="space-y-4">
				<p className="text-base font-bold text-white">Signup decision:</p>
				<div className="rounded-2xl border border-blue-400/20 bg-cinder-950/75 p-5 shadow-2xl shadow-black/25 ring-1 ring-white/5">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
								Email to check
							</p>
							<p className="mt-4 text-lg font-medium text-white">trial-reset@examplemail.co</p>
							<p className="mt-4 text-sm text-gray-400">Decision ready.</p>
						</div>
						<p className="text-xs font-semibold text-gray-400">01 / 03</p>
					</div>
				</div>
				<div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5 shadow-2xl shadow-black/25 ring-1 ring-white/5">
					<p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
						Signup decision
					</p>
					<div className="mt-4 flex items-center gap-3 text-xl font-semibold text-amber-300">
						<ExclamationTriangleIcon className="size-6" />
						Challenge
					</div>
					<div className="mt-6">
						<p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
							Signals
						</p>
						<div className="mt-3 flex flex-wrap gap-2">
							{["Disposable domain", "Anonymous IP", "Repeat pattern"].map((item) => (
								<span
									key={item}
									className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-sm text-amber-100"
								>
									{item}
								</span>
							))}
						</div>
					</div>
				</div>
				<div className="rounded-2xl border border-white/8 bg-cinder-950/70 p-5 ring-1 ring-white/5">
					<p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
						Recommended action
					</p>
					<p className="mt-3 text-sm/7 text-gray-400">
						Hold free credits until email verification is complete, then route repeated attempts into
						review or block.
					</p>
				</div>
			</div>
		</div>
	)
}

export default async function FreeTrialAbusePreventionPage() {
	const session = await isUserLoggedIn()

	return (
		<div className="bg-gray-950 text-white">
			<Header session={session} />
			<main>
				<section className="relative isolate overflow-hidden bg-linear-to-b from-gray-900">
					<div className="pointer-events-none absolute inset-0 -z-20">
						<div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_82%_12%,rgba(99,102,241,0.18),transparent_24%),radial-gradient(circle_at_72%_74%,rgba(56,189,248,0.08),transparent_26%)]" />
						<div className="absolute left-[62%] top-[-16%] h-[155%] w-48 rotate-[24deg] bg-linear-to-b from-white/14 via-blue-300/8 to-transparent blur-sm" />
						<div className="absolute -left-24 top-24 h-64 w-64 rounded-full bg-blue-600/16 blur-3xl" />
						<div className="absolute right-[-8rem] top-10 h-80 w-80 rounded-full bg-violet-500/14 blur-3xl" />
					</div>
					<div className="mx-auto grid min-h-screen max-w-7xl gap-14 px-6 pb-16 pt-32 sm:pt-36 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)] lg:items-center lg:px-8 lg:pt-24">
						<div className="max-w-3xl">
							<div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-blue-300">
								Free-trial abuse prevention
							</div>
							<h1 className="mt-6 text-5xl font-bold tracking-tight text-pretty text-white sm:text-6xl">
								Prevent Free-Trial Abuse at Signup
							</h1>
							<p className="mt-8 max-w-2xl text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
								Stop repeat trials, fake accounts, and disposable emails before they drain free
								credits, waste infrastructure, and distort your growth metrics.
							</p>
							<p className="mt-5 max-w-2xl text-base/8 font-medium text-gray-400">
								Gatekeepr analyzes email, IP, and user agent during signup and returns a clear
								decision: <strong className="text-white">allow</strong>,{" "}
								<strong className="text-white">challenge</strong>, or{" "}
								<strong className="text-white">block</strong>.
							</p>
							<div className="mt-10 flex flex-col items-start gap-4 sm:flex-row">
								<PrimaryLink href={session ? "/dashboard" : "/get-free-api-key"}>
									Start Free
								</PrimaryLink>
								<SecondaryLink href="https://docs.gatekeepr.io/">
									View API Docs
								</SecondaryLink>
							</div>
							<p className="mt-3 flex flex-row flex-wrap gap-2 text-sm text-gray-400 sm:gap-0">
								<span>Free trials</span><span className="mx-1 sm:mx-2">•</span>
								<span>Free credits</span><span className="mx-1 sm:mx-2">•</span>
								<span>Freemium plans</span><span className="mx-1 sm:mx-2">•</span>
								<span>REST API</span>
							</p>
						</div>
						<SignupDecisionCard />
					</div>
					<div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-linear-to-t from-gray-950 sm:h-32" />
				</section>

				<Section className="bg-gray-950 pt-8 sm:pt-10 lg:!pt-0">
					<div className="relative isolate">
						<div className="absolute -left-10 top-8 -z-10 h-40 w-40 rounded-full bg-blue-600/12 blur-3xl" />
						<div className="absolute right-0 top-24 -z-10 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
						<SectionIntro
							eyebrow="Why it matters"
							title="Free-trial abuse becomes a growth tax fast"
							description="Bad signups do more than inflate account counts. They create real cost and make your funnel harder to trust."
						/>
						<div className="mt-10 grid gap-5 lg:mt-12 lg:grid-cols-4">
							{painCards.map((card) => (
								<article
									key={card.title}
									className={clsx(baseCardClassName, "min-h-64 transition-transform duration-200 hover:-translate-y-1")}
								>
									<div className="pointer-events-none absolute inset-0">
										<div className="absolute -right-10 top-0 h-28 w-28 rounded-full bg-blue-500/10 blur-3xl" />
										<div className="absolute left-6 bottom-0 h-20 w-24 rounded-full bg-cyan-400/8 blur-2xl" />
									</div>
									<div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
										<card.icon className="size-6" />
									</div>
									<h3 className="text-xl font-semibold tracking-tight text-white">{card.title}</h3>
									<p className="mt-4 text-sm/7 text-gray-400">{card.description}</p>
								</article>
							))}
						</div>
					</div>
				</Section>

				<Section className="bg-cinder-950/35">
					<div className="relative isolate">
						<div className="absolute left-10 top-10 -z-10 h-48 w-48 rounded-full bg-blue-600/10 blur-3xl" />
						<div className="absolute right-0 top-20 -z-10 h-56 w-56 rounded-full bg-violet-500/8 blur-3xl" />
						<div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
							<SectionIntro
								eyebrow="Common abuse patterns"
								title="What free-trial abuse usually looks like"
								description="Most repeat signup abuse follows a few common patterns that show up before the account is even created."
							/>
							<div className="grid gap-4 sm:grid-cols-2">
								{abusePatterns.map((item) => (
									<article
										key={item.title}
										className="rounded-3xl border border-white/8 bg-cinder-900/55 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.26)] ring-1 ring-white/5"
									>
										<h3 className="text-xl font-semibold tracking-tight text-white">{item.title}</h3>
										<p className="mt-3 text-sm/7 text-gray-400">{item.description}</p>
									</article>
								))}
							</div>
						</div>
					</div>
				</Section>

				<Section className="bg-gray-950">
					<SectionIntro
						eyebrow="Why common defenses fall short"
						title="CAPTCHA and basic email validation are not enough"
						description="Gatekeepr is built to make a clear decision at signup, before free access is granted."
					/>
					<div className="mt-10 grid gap-5 lg:mt-12 lg:grid-cols-3">
						{defenseComparisons.map((item) => (
							<article key={item.title} className={baseCardClassName}>
								<h3 className="text-2xl font-semibold tracking-tight text-white">{item.title}</h3>
								<p className="mt-4 text-base/8 text-gray-400">{item.description}</p>
							</article>
						))}
					</div>
				</Section>

				<Section className="bg-gray-950">
					<div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
						<SectionIntro
							eyebrow="How Gatekeepr works"
							title="A clear signup decision your team can enforce immediately"
							description="Gatekeepr evaluates email, IP, and user agent in real time and returns a final status: allow, challenge, or block."
						/>
						<div className="space-y-4">
							{decisions.map((item) => (
								<article
									key={item.title}
									className={clsx("rounded-3xl border p-6 shadow-[0_20px_60px_rgba(0,0,0,0.24)] ring-1 ring-white/5", item.className)}
								>
									<div className="flex items-start gap-4">
										<div className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-current/20 bg-black/10">
											<item.icon className="size-6" />
										</div>
										<div>
											<h3 className="text-2xl font-semibold tracking-tight text-white">{item.title}</h3>
											<p className="mt-2 text-base/8 text-gray-300">{item.description}</p>
										</div>
									</div>
								</article>
							))}
						</div>
					</div>
					<div className="mt-8 grid gap-5 lg:grid-cols-3">
						{policies.map((item) => (
							<article key={item.title} className="rounded-3xl border border-white/8 bg-cinder-950/70 p-6 ring-1 ring-white/5">
								<h3 className="text-xl font-semibold tracking-tight text-white">{item.title}</h3>
								<p className="mt-4 text-sm/7 text-gray-400">{item.description}</p>
							</article>
						))}
					</div>
				</Section>

				<Section className="bg-cinder-950/35">
					<SectionIntro
						eyebrow="API example"
						title="Built to fit directly into your signup flow"
						description="Call Gatekeepr during account creation and map the result to your enforcement logic."
					/>
					<div className="mt-10 grid gap-6 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_340px]">
						<div className="rounded-[1.8rem] border border-white/8 bg-cinder-950/80 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] ring-1 ring-white/5 sm:p-6">
							<div className="grid gap-5 xl:grid-cols-2">
								<div>
									<p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
										Request
									</p>
									<pre className="mt-4 min-h-64 overflow-x-auto rounded-2xl border border-white/8 bg-gray-950/80 p-5 text-sm/7 text-cyan-100">
										<code>{`POST /v1/signup/check

{
  "email": "user@example.com",
  "ip": "203.0.113.24",
  "user_agent": "Mozilla/5.0"
}`}</code>
									</pre>
								</div>
								<div>
									<p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
										Response
									</p>
									<pre className="mt-4 min-h-64 overflow-x-auto rounded-2xl border border-white/8 bg-gray-950/80 p-5 text-sm/7 text-cyan-100">
										<code>{`{
  "status": "challenge",
  "threats": ["disposable_email", "anonymous_ip"],
  "trust": ["valid_email_syntax"],
  "blocklists": ["known_disposable_provider"],
  "info": {
    "ip_type": "vpn",
    "email_domain": "examplemail.co"
  }
}`}</code>
									</pre>
								</div>
							</div>
						</div>
						<article className={baseCardClassName}>
							<div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
								<ShieldCheckIcon className="size-6" />
							</div>
							<h3 className="text-2xl font-semibold tracking-tight text-white">Simple policy mapping</h3>
							<p className="mt-4 text-base/8 text-gray-400">
								Use allow to continue signup, challenge to add verification, and block to reject the
								account before free access is granted.
							</p>
							<Link href="https://docs.gatekeepr.io" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-300 hover:text-blue-200">
								View API Docs
								<ArrowRightIcon className="size-4" />
							</Link>
						</article>
					</div>
				</Section>

				<Section className="bg-gray-950">
					<SectionIntro
						eyebrow="Use cases"
						title="Built for self-serve SaaS where abuse has real cost"
						description="Use this when bad signups burn credits, inflate product metrics, or create immediate infrastructure expense."
					/>
					<div className="mt-10 grid gap-5 md:grid-cols-2 lg:mt-12 xl:grid-cols-3">
						{useCases.map((item) => (
							<article key={item.title} className={baseCardClassName}>
								<h3 className="text-xl font-semibold tracking-tight text-white">{item.title}</h3>
								<p className="mt-4 text-base/7 text-gray-400">{item.description}</p>
							</article>
						))}
					</div>
				</Section>

				<Section className="bg-gray-950">
					<div className="mx-auto max-w-4xl">
						<SectionIntro
							eyebrow="FAQ"
							title="Frequently asked questions"
							description="These are the rollout and implementation questions teams ask when they are trying to stop repeat signups without breaking the normal signup flow."
							align="center"
						/>
						<div className="mt-10 space-y-4 lg:mt-12">
							{faqs.map((item) => (
								<details
									key={item.question}
									className="group rounded-3xl border border-white/8 bg-cinder-950/80 p-6 ring-1 ring-white/5 open:border-blue-500/20 open:bg-cinder-900/80"
								>
									<summary className="cursor-pointer list-none text-lg font-semibold text-white marker:hidden">
										<div className="flex items-center justify-between gap-6">
											<span>{item.question}</span>
											<SparklesIcon className="size-5 shrink-0 text-blue-300 transition-transform group-open:rotate-45" />
										</div>
									</summary>
									<p className="mt-4 text-base/8 text-gray-400">{item.answer}</p>
								</details>
							))}
						</div>
					</div>
				</Section>

				<Section compact={true} className="bg-gray-950">
					<div className="mx-auto max-w-6xl">
						<div className="relative isolate overflow-hidden rounded-[1.8rem] border border-blue-950/70 bg-cinder-900/70 px-8 py-14 shadow-[0_24px_80px_rgba(0,0,0,0.28)] ring-1 ring-white/5 sm:px-10 sm:py-16 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-12">
							<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-blue-400/40 to-transparent" />
							<div className="absolute -left-16 top-4 -z-10 h-40 w-40 rounded-full bg-blue-600/18 blur-3xl" />
							<div className="absolute right-10 top-10 -z-10 h-52 w-52 rounded-full bg-violet-500/12 blur-3xl" />
							<div className="max-w-2xl">
								<h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
									<span className="block">Stop free-trial abuse</span>
									<span className="block text-cinder-100">before it drains your free plan</span>
								</h2>
								<p className="mt-4 text-base/8 text-gray-400 sm:text-lg/8">
									Protect free credits, reduce signup waste, and keep legitimate users moving with a
									clear allow, challenge, or block decision at signup.
								</p>
							</div>
							<div className="mt-8 flex flex-col items-center gap-3 text-center lg:mt-0 lg:shrink-0 lg:items-start lg:text-left">
								<PrimaryLink href={session ? "/dashboard" : "/get-free-api-key"}>
									Start Free
								</PrimaryLink>
								<div className="max-w-xs space-y-1 text-sm text-gray-400 lg:max-w-none">
									<p>No credit card required</p>
									<p>1,000 free checks</p>
								</div>
							</div>
						</div>
					</div>
				</Section>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
