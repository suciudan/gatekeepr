import Link from "next/link"
import {
	ArrowRightIcon,
	BookOpenIcon,
	BoltIcon,
	ChartBarIcon,
	CheckCircleIcon,
	ChevronDownIcon,
	CodeBracketIcon,
	EnvelopeIcon,
	ExclamationTriangleIcon,
	GlobeAltIcon,
	ShieldExclamationIcon,
	UserIcon,
	WifiIcon,
	XCircleIcon,
} from "@heroicons/react/24/outline"

import CopySnippetButton from "@/components/CopySnippetButton"
import Footer from "@/components/Footer"
import Header from "@/components/Header"
import { isUserLoggedIn } from "@/libs/user"

export const metadata = {
	title: "How It Works | Gatekeepr",
	description: "See how Gatekeepr turns email, IP, domain, and user-agent checks into a clear signup decision your product can enforce in real time.",
	alternates: {
		canonical: "/how-it-works",
	},
}

const requestSnippet = `curl -X POST "https://api.gatekeepr.io" \\
  -H "Authorization: [API_KEY]" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "ip": "203.0.113.10",
    "user_agent": "Mozilla/5.0 ..."
  }'`

const responseSnippet = `{
  "status": "allow",
  "threats": [],
  "trust": ["email_passes_rfc5322"],
  "blocklists": [],
  "info": {
    "email_known_provider": "gmail"
  }
}`

const signalCards = [
	{
		title: "Email checks",
		body: "Detect disposable and temporary email providers, suspicious aliases, role accounts, malformed addresses, and patterns that look auto-generated instead of human.",
		icon: EnvelopeIcon,
		accent: "blue",
	},
	{
		title: "Domain checks",
		body: "Verify that the domain is real, registered, and able to receive mail. Catch newly created, expired, invalid, or low-trust domains before they turn into fake accounts.",
		icon: GlobeAltIcon,
		accent: "violet",
	},
	{
		title: "IP checks",
		body: "Inspect network reputation and infrastructure signals such as Tor exits, abuse blocklists, hosting ranges, anonymized traffic, and other risky signup sources.",
		icon: WifiIcon,
		accent: "amber",
	},
	{
		title: "User-agent checks",
		body: "Flag headless browsers, automation tools, scripted clients, and non-human request patterns that often show up in bot signup campaigns.",
		icon: BoltIcon,
		accent: "rose",
	},
]

const decisions = [
	{
		title: "Allow",
		body: "Create the account normally. Good users move through signup without extra friction.",
		icon: CheckCircleIcon,
		accent: "emerald",
	},
	{
		title: "Challenge",
		body: "Ask for one more proof point when risk is uncertain. Trigger email verification, CAPTCHA, OTP, or limited access until the user proves intent.",
		icon: ExclamationTriangleIcon,
		accent: "amber",
	},
	{
		title: "Block",
		body: "Stop the signup before free credits, infrastructure, analytics, or support time are wasted.",
		icon: XCircleIcon,
		accent: "rose",
	},
]

const protectionItems = [
	{
		title: "Stop free-trial abuse",
		body: "Make it harder for users to create multiple accounts just to keep accessing your free plan or credits.",
		icon: ShieldExclamationIcon,
		accent: "rose",
	},
	{
		title: "Block disposable emails",
		body: "Keep throwaway inboxes out of your funnel before they inflate signups and lower lead quality.",
		icon: EnvelopeIcon,
		accent: "blue",
	},
	{
		title: "Reduce bot signups",
		body: "Catch automated signup attempts before they burn infrastructure, trigger noisy support work, or create junk accounts.",
		icon: UserIcon,
		accent: "amber",
	},
	{
		title: "Keep analytics clean",
		body: "Protect activation, conversion, and retention metrics from fake accounts that distort product decisions.",
		icon: ChartBarIcon,
		accent: "emerald",
	},
]

const useCases = [
	"Account creation",
	"Free-trial signup",
	"Waitlists",
	"Invite flows",
	"Onboarding forms",
	"Self-serve entry points",
]

const faqs = [
	{
		question: "What data does Gatekeepr need to evaluate a signup?",
		answer: "Email is required. IP address and user agent make the decision stronger by adding network and browser context.",
	},
	{
		question: "What does a challenge decision mean?",
		answer: "A challenge means Gatekeepr found suspicious or incomplete signals, but not enough for a hard block. It gives you room to add smart friction only when needed.",
	},
	{
		question: "Is Gatekeepr just for disposable email detection?",
		answer: "No. Gatekeepr is built for signup abuse prevention. It combines email, domain, IP, and user-agent checks to help stop fake signups and repeat free-trial abuse.",
	},
	{
		question: "Can I use Gatekeepr with my existing backend?",
		answer: "Yes. Gatekeepr is designed to fit into existing signup and onboarding flows through a simple API call.",
	},
]

const accentClasses = {
	blue: {
		line: "from-blue-400 via-blue-400/45 to-transparent",
		iconWrap: "border-blue-500/25 bg-blue-500/10 text-blue-300",
		iconText: "text-blue-300",
	},
	violet: {
		line: "from-violet-400 via-violet-400/45 to-transparent",
		iconWrap: "border-violet-500/25 bg-violet-500/10 text-violet-300",
		iconText: "text-violet-300",
	},
	amber: {
		line: "from-amber-400 via-amber-400/45 to-transparent",
		iconWrap: "border-amber-500/25 bg-amber-500/10 text-amber-300",
		iconText: "text-amber-300",
	},
	rose: {
		line: "from-rose-400 via-rose-400/45 to-transparent",
		iconWrap: "border-rose-500/25 bg-rose-500/10 text-rose-300",
		iconText: "text-rose-300",
	},
	emerald: {
		line: "from-emerald-400 via-emerald-400/45 to-transparent",
		iconWrap: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
		iconText: "text-emerald-300",
	},
}

function PrimaryCta({ href, children }) {
	return (
		<Link
			href={href}
			className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-7 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_30px_rgba(37,99,235,0.3)]"
		>
			{children}
			<ArrowRightIcon className="size-4" />
		</Link>
	)
}

function SecondaryCta({ href, children, external = false }) {
	return (
		<Link
			href={href}
			target={external ? "_blank" : undefined}
			rel={external ? "noopener noreferrer" : undefined}
			className="inline-flex items-center gap-2 rounded-lg border border-[#1a2744] px-7 py-3 text-sm font-semibold text-gray-100 transition-all hover:border-[#2a3a5c] hover:bg-[#0f1525]"
		>
			<BookOpenIcon className="size-4" />
			{children}
		</Link>
	)
}

function StepLabel({ number }) {
	return (
		<div className="mb-5 flex items-center gap-3">
			<span className="font-mono text-5xl font-bold leading-none text-blue-500/30">{number}</span>
			<div className="h-px flex-1 bg-blue-500/10" />
		</div>
	)
}

function CodeWindow({ label, code }) {
	return (
		<div className="overflow-hidden rounded-xl border border-[#1a2744]/60 bg-[#0a0e1a]">
			<div className="flex items-center justify-between gap-3 border-b border-[#1a2744]/40 bg-[#0c1322] px-4 py-3">
				<div className="flex items-center gap-2">
					<div className="flex gap-1.5">
						<span className="size-2.5 rounded-full bg-rose-400/60" />
						<span className="size-2.5 rounded-full bg-amber-400/60" />
						<span className="size-2.5 rounded-full bg-emerald-400/60" />
					</div>
					<span className="ml-2 font-mono text-xs text-gray-400">{label}</span>
				</div>
				<CopySnippetButton value={code} />
			</div>
			<pre className="overflow-x-auto p-5">
				<code className="font-mono text-[13px] leading-7 text-gray-100/90">{code}</code>
			</pre>
		</div>
	)
}

function SignalCard({ card }) {
	const accent = accentClasses[card.accent]

	return (
		<div className="relative overflow-hidden rounded-lg border border-[#1a2744]/60 bg-[#0c1322] p-4">
			<div className={`absolute inset-x-0 top-0 h-px bg-linear-to-r ${accent.line}`} />
			<div className={`flex size-9 items-center justify-center rounded-lg border ${accent.iconWrap}`}>
				<card.icon className="size-4" />
			</div>
			<div className="mt-3">
				<p className="text-sm font-semibold text-white">{card.title}</p>
				<p className="mt-1 text-xs/5 text-gray-400">{card.body}</p>
			</div>
		</div>
	)
}

function FaqItem({ item }) {
	return (
		<details className="group overflow-hidden rounded-xl border border-[#1a2744]/60 bg-[#0c1322]">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-left">
				<span className="text-[15px] font-semibold text-white">{item.question}</span>
				<ChevronDownIcon className="size-5 shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180" />
			</summary>
			<p className="px-5 pb-5 text-[15px]/7 text-gray-400">{item.answer}</p>
		</details>
	)
}

export default async function HowItWorksPage() {
	const session = await isUserLoggedIn()

	return (
		<div className="bg-gray-950 text-white">
			<Header session={session} />
			<main className="pb-20 md:pb-28">
				<section className="relative overflow-hidden px-6 pt-28 md:pt-36">
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute left-1/2 top-1/2 h-[350px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-[120px]" />
					</div>
					<div className="relative mx-auto flex min-h-[calc(100vh-9rem)] max-w-5xl items-center">
						<div className="max-w-3xl">
							<p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-blue-400">
								How it works
							</p>
							<h1 className="text-[clamp(36px,5vw,56px)] font-bold leading-[1.1] tracking-[-0.03em] text-white">
								Stop fake signups in{" "}
								<span className="bg-linear-to-r from-blue-500 to-blue-300 bg-clip-text text-transparent">
									one API call
								</span>
							</h1>
							<p className="mt-6 max-w-2xl text-lg/8 text-gray-300">
								Gatekeepr helps SaaS teams prevent free-trial abuse, block disposable emails, and
								reduce bot signups before accounts are created. Send the signup data you already
								collect, and Gatekeepr returns a clear decision your product can use instantly:
								{" "}
								<span className="font-semibold text-emerald-400">allow</span>,{" "}
								<span className="font-semibold text-amber-300">challenge</span>, or{" "}
								<span className="font-semibold text-rose-300">block</span>.
							</p>
							<div className="mt-8 flex flex-wrap items-center gap-4">
								<PrimaryCta href={session ? "/dashboard" : "/get-free-api-key"}>Start Free</PrimaryCta>
								<SecondaryCta href="https://docs.gatekeepr.io" external={true}>
									View API Docs
								</SecondaryCta>
							</div>
							<p className="mt-6 text-sm font-medium text-gray-400">
								Real-time signup protection for modern SaaS products
							</p>
						</div>
					</div>
				</section>

				<section className="px-6">
					<div className="mx-auto mb-20 max-w-5xl md:mb-28">
						<div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
							<div>
								<StepLabel number="01" />
								<h2 className="text-[clamp(24px,3vw,32px)] font-bold leading-[1.2] tracking-[-0.02em] text-white">
									Send the signup data you already have
								</h2>
								<p className="mt-4 text-base/8 text-gray-400">
									Add Gatekeepr to your signup flow, free-trial flow, waitlist, onboarding, or
									invite flow. Pass the email address, IP address, and user agent from the request.
									No complex setup. No heavy fraud system. Just one API call inside the flow you
									already own.
								</p>
								<p className="mt-6 flex items-center gap-2 text-[13px] text-gray-500">
									<BoltIcon className="size-3.5 text-blue-400" />
									Use Gatekeepr anywhere a user can create an account or claim free product value.
								</p>
							</div>
							<CodeWindow label="bash" code={requestSnippet} />
						</div>
					</div>
				</section>

				<section className="px-6">
					<div className="mx-auto mb-20 max-w-5xl md:mb-28">
						<div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
							<div className="grid grid-cols-2 gap-3 md:order-1">
								{signalCards.map((card) => (
									<SignalCard key={card.title} card={card} />
								))}
							</div>
							<div className="md:order-2">
								<StepLabel number="02" />
								<h2 className="text-[clamp(24px,3vw,32px)] font-bold leading-[1.2] tracking-[-0.02em] text-white">
									Gatekeepr checks the signals bad signups leave behind
								</h2>
								<p className="mt-4 text-base/8 text-gray-400">
									A fake signup rarely looks bad in just one place. Gatekeepr evaluates multiple
									signals together so you can make a better decision than email validation alone.
								</p>
							</div>
						</div>
					</div>
				</section>

				<section className="px-6">
					<div className="mx-auto mb-24 max-w-5xl md:mb-32">
						<div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
							<div>
								<StepLabel number="03" />
								<h2 className="text-[clamp(24px,3vw,32px)] font-bold leading-[1.2] tracking-[-0.02em] text-white">
									Get a decision your product can act on instantly
								</h2>
								<p className="mt-4 text-base/8 text-gray-400">
									Gatekeepr returns a simple decision instead of forcing your team to interpret a
									raw risk score.
								</p>
								<div className="mt-6 space-y-3">
									{decisions.map((item) => (
										<div key={item.title} className="flex items-center gap-3">
											<item.icon className={`size-5 shrink-0 ${accentClasses[item.accent].iconText}`} />
											<span
												className={`font-mono text-xs font-bold uppercase tracking-[0.06em] ${accentClasses[item.accent].iconText}`}
											>
												{item.title}
											</span>
											<span className="text-sm text-gray-400">
												- {item.body.split(".")[0]}.
											</span>
										</div>
									))}
								</div>
							</div>
							<div>
								<CodeWindow label="response.json" code={responseSnippet} />
								<p className="mt-4 flex items-center gap-2 font-mono text-[13px] text-gray-500">
									<CodeBracketIcon className="size-3.5 shrink-0 text-blue-400" />
									Use <code className="text-gray-200">status</code> for the product decision. Use{" "}
									<code className="text-gray-200">threats</code> and <code className="text-gray-200">trust</code>{" "}
									for visibility and internal rules.
								</p>
							</div>
						</div>
					</div>
				</section>

				<section className="relative mb-24 overflow-hidden px-6 py-20 md:mb-32">
					<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[#1a2744] to-transparent" />
					<div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-[#1a2744] to-transparent" />
					<div className="absolute inset-0 bg-linear-to-b from-transparent via-blue-500/[0.03] to-transparent" />
					<div className="relative mx-auto max-w-3xl">
						<h2 className="text-[clamp(24px,3vw,32px)] font-bold leading-[1.25] tracking-[-0.02em] text-white">
							More than a disposable email checker API
						</h2>
						<p className="mt-5 text-base/8 text-gray-400">
							Blocking temporary email addresses is useful, but it is not enough. Repeat trial
							abusers also use fresh domains, risky IP infrastructure, anonymized traffic, and
							automated browsers to create fake accounts at scale. Gatekeepr combines those signals
							into one real-time signup abuse prevention layer built for SaaS products.
						</p>
						<div className="mt-8 flex gap-5">
							<div className="w-1 shrink-0 rounded-full bg-linear-to-b from-blue-500 via-blue-500/40 to-transparent" />
							<p className="text-[17px]/8 font-medium text-white">
								Email validation tells you whether an address looks real. Gatekeepr helps you
								decide whether the signup should be trusted.
							</p>
						</div>
					</div>
				</section>

				<section className="px-6">
					<div className="mx-auto mb-24 max-w-5xl md:mb-32">
						<div className="mb-12 text-center">
							<p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-blue-400">
								Built for SaaS signup protection
							</p>
							<h2 className="text-[clamp(26px,4vw,38px)] font-bold leading-[1.2] tracking-[-0.025em] text-white">
								Protect the metrics that actually matter
							</h2>
						</div>
						<div className="grid gap-5 md:grid-cols-2">
							{protectionItems.map((item) => (
								<div
									key={item.title}
									className="flex gap-4 rounded-xl border border-[#1a2744]/60 bg-[#0c1322] p-6"
								>
									<div
										className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${accentClasses[item.accent].iconWrap}`}
									>
										<item.icon className="size-5" />
									</div>
									<div>
										<h3 className="text-base font-semibold text-white">{item.title}</h3>
										<p className="mt-1.5 text-[15px]/7 text-gray-400">{item.body}</p>
									</div>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="px-6">
					<div className="mx-auto mb-24 max-w-5xl md:mb-32">
						<div className="rounded-xl border border-[#1a2744]/60 bg-[#0c1322] p-8 md:p-10">
							<h2 className="text-[clamp(22px,3vw,28px)] font-bold leading-[1.3] tracking-[-0.02em] text-white">
								Add protection anywhere users can claim value
							</h2>
							<p className="mt-4 text-base/8 text-gray-400">
								Use Gatekeepr on account creation, free-trial signup, waitlists, invite flows,
								onboarding forms, and high-risk self-serve entry points. If a flow creates an
								account, provisions credits, or opens product access, it is a good place to run a
								check.
							</p>
							<div className="mt-8 flex flex-wrap gap-2.5">
								{useCases.map((item) => (
									<span
										key={item}
										className="rounded-lg border border-[#1a2744]/60 bg-[#0f1525] px-4 py-2 font-mono text-[13px] font-medium text-white"
									>
										{item}
									</span>
								))}
							</div>
						</div>
					</div>
				</section>

				<section className="px-6">
					<div className="mx-auto mb-24 max-w-3xl md:mb-32">
						<h2 className="mb-10 text-center text-[clamp(24px,3vw,32px)] font-bold tracking-[-0.02em] text-white">
							Frequently asked questions
						</h2>
						<div className="space-y-3">
							{faqs.map((item) => (
								<FaqItem key={item.question} item={item} />
							))}
						</div>
					</div>
				</section>

				<section className="px-6">
					<div className="mx-auto max-w-3xl text-center">
						<h2 className="text-[clamp(26px,4vw,38px)] font-bold leading-[1.2] tracking-[-0.025em] text-white">
							Protect your signup flow before abuse becomes a{" "}
							<span className="bg-linear-to-r from-blue-500 to-blue-300 bg-clip-text text-transparent">
								growth tax
							</span>
						</h2>
						<p className="mx-auto mt-5 max-w-xl text-[17px]/8 text-gray-400">
							Stop fake signups, block disposable emails, and slow repeat trial abuse before bad
							accounts reach your product.
						</p>
						<div className="mt-8 flex flex-wrap items-center justify-center gap-4">
							<PrimaryCta href={session ? "/dashboard" : "/get-free-api-key"}>Start Free</PrimaryCta>
							<SecondaryCta href="https://docs.gatekeepr.io" external={true}>
								Explore Docs
							</SecondaryCta>
						</div>
					</div>
				</section>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
