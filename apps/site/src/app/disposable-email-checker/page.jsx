import {
	ArrowRightIcon,
	ChartBarSquareIcon,
	CreditCardIcon,
	UserGroupIcon
} from "@heroicons/react/24/solid"
import Link from "next/link"
import clsx from "clsx"

import DisposableEmailChecker from "./Checker"
import FAQ from "@/components/FAQ"
import Footer from "@/components/Footer"
import Header from "@/components/Header"
import HowItWorks from "@/components/HowItWorks"
import Section from "@/components/Section"
import { isUserLoggedIn } from "@/libs/user"

export const metadata = {
	title: "Disposable Email Checker - Detect Temporary Emails Before Signup | Gatekeepr",
	description: "Check if an email address or domain is disposable, temporary, or throwaway. Use Gatekeepr to block fake signups, trial abuse, and risky accounts in real time.",
	alternates: {
		canonical: "/disposable-email-checker"
	}
}

const problemCards = [
	{
		title: "Block fake signups",
		description: "Stop temporary inboxes before they enter your user database.",
		icon: UserGroupIcon
	},
	{
		title: "Protect free trials",
		description: "Reduce repeat accounts created to farm free plans, credits, or trials.",
		icon: CreditCardIcon
	},
	{
		title: "Keep analytics clean",
		description: "Prevent fake users from distorting activation, conversion, and retention data.",
		icon: ChartBarSquareIcon
	}
]

const faqs = [
	{
		question: "What is a disposable email checker?",
		answer: "A disposable email checker detects whether an email address or domain belongs to a temporary, burner, or throwaway email provider."
	},
	{
		question: "Why block disposable emails?",
		answer: "Disposable emails make it easy to create fake accounts, abuse free trials, and avoid durable identity checks during signup."
	},
	{
		question: "Should I block every disposable email?",
		answer: "Not always. Some users use temporary emails for privacy. For uncertain cases, Gatekeepr can return challenge instead of forcing a hard block."
	},
	{
		question: "Can I use this in my signup flow?",
		answer: "Yes. Gatekeepr provides an API that can be added to signup, onboarding, waitlist, and free-trial flows."
	}
]

const pageContainerClassName = "mx-auto max-w-7xl px-6 lg:px-8"

function Eyebrow({ children }) {
	return (
		<div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-blue-300">
			{children}
		</div>
	)
}

function SectionHeading({ eyebrow, title, children, center = false }) {
	return (
		<div className={clsx(center ? "mx-auto max-w-3xl text-center" : "max-w-4xl")}>
			<Eyebrow>{eyebrow}</Eyebrow>
			<h2 className="mt-6 text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl lg:text-[3.1rem]/[1.04]">
				{title}
			</h2>
			{children && (
				<div className={clsx("mt-6 text-base/8 text-gray-400 sm:text-lg/8", center && "mx-auto max-w-3xl")}>
					{children}
				</div>
			)}
		</div>
	)
}

function InfoCard({ item }) {
	return (
		<article className="relative overflow-hidden rounded-[1.6rem] border border-white/8 bg-cinder-900/55 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] ring-1 ring-white/5">
			<div className="absolute -right-10 top-2 h-28 w-28 rounded-full bg-blue-500/10 blur-3xl" />
			{item.icon && (
				<div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
					<item.icon className="size-6" />
				</div>
			)}
			<h3 className="text-xl font-semibold tracking-tight text-white">
				{item.title}
			</h3>
			<p className="mt-3 text-base/7 text-gray-400">
				{item.description}
			</p>
		</article>
	)
}

function Schema() {
	const softwareSchema = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "Gatekeepr Disposable Email Checker",
		applicationCategory: "SecurityApplication",
		operatingSystem: "Web",
		description: "Check whether an email address or domain is disposable, temporary, or throwaway. Gatekeepr helps SaaS teams block fake signups and free-trial abuse.",
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD"
		}
	}

	const faqSchema = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map((faq) => ({
			"@type": "Question",
			name: faq.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: faq.answer
			}
		}))
	}

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
			/>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
			/>
		</>
	)
}

export default async function DisposableEmailCheckerPage() {
	const session = await isUserLoggedIn()

	return (
		<div className="bg-gray-950">
			<Schema />
			<Header session={session} />

			<main>
				<section className="relative isolate flex min-h-[calc(100svh-4rem)] items-center overflow-hidden bg-linear-to-b from-gray-900 pt-24 pb-12 sm:min-h-[calc(100svh-4.5rem)] sm:pt-28 sm:pb-16 lg:pt-32">
					<div className="pointer-events-none absolute inset-0 -z-20">
						<div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_82%_12%,rgba(99,102,241,0.18),transparent_24%),radial-gradient(circle_at_72%_74%,rgba(56,189,248,0.08),transparent_26%)]" />
						<div className="absolute left-[62%] top-[-16%] h-[155%] w-48 rotate-[24deg] bg-linear-to-b from-white/14 via-blue-300/8 to-transparent blur-sm" />
					</div>
					<div className={clsx(pageContainerClassName, "grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)] lg:items-center lg:gap-14")}>
						<div className="max-w-3xl text-left">
							<h1 className="mt-6 text-5xl font-bold tracking-tight text-pretty text-white sm:text-6xl">
								Free Disposable Email Checker
							</h1>
							<p className="mt-8 max-w-2xl text-lg/8 font-medium text-gray-400 sm:text-xl/8">
								Check whether an email address or domain is temporary, throwaway, or risky before it reaches your signup flow.
							</p>
						</div>
						<div className="w-full">
							<DisposableEmailChecker />
						</div>
					</div>
					<div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-linear-to-t from-gray-950 sm:h-32" />
				</section>

				<Section className="bg-gray-950" containerClassName={pageContainerClassName}>
					<div className="relative isolate">
						<SectionHeading eyebrow="Why it matters" title="Catch throwaway emails before they become fake accounts">
							<p>
								Disposable emails are often used to create fake accounts, abuse free trials, and bypass signup limits. Gatekeepr helps SaaS teams detect risky email addresses early, before they pollute your product, analytics, or free plan.
							</p>
						</SectionHeading>
						<div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
							{problemCards.map((item) => (
								<InfoCard item={item} key={item.title} />
							))}
						</div>
					</div>
				</Section>

				<Section compact={true} className="bg-gray-950" containerClassName={pageContainerClassName}>
					<SectionHeading eyebrow="Built for SaaS signups" title="More than a disposable email lookup" center={true}>
						<p>
							A one-off checker is useful for testing an email. Gatekeepr is built to protect every signup automatically.
						</p>
					</SectionHeading>
					<div className="mt-10 grid gap-6 lg:grid-cols-2">
						<article className="rounded-[1.6rem] border border-white/8 bg-cinder-900/55 p-7 ring-1 ring-white/5">
							<h3 className="text-2xl font-semibold text-white">Free checker</h3>
							<p className="mt-4 text-base/8 text-gray-400">
								Manually check an email address or domain to see whether it appears disposable, temporary, or throwaway.
							</p>
						</article>
						<article className="rounded-[1.6rem] border border-blue-500/25 bg-blue-500/10 p-7 ring-1 ring-blue-400/10">
							<h3 className="text-2xl font-semibold text-white">Gatekeepr API</h3>
							<p className="mt-4 text-base/8 text-blue-100">
								Analyze email, IP, and user-agent signals during signup and return a clear decision: allow, challenge, or block.
							</p>
						</article>
					</div>
					<div className="mt-8 flex justify-center">
						<Link
							href="/get-free-api-key"
							className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-500"
						>
							Protect every signup
							<ArrowRightIcon className="size-5" />
						</Link>
					</div>
				</Section>

				<HowItWorks containerClassName={pageContainerClassName} />

				<Section compact={true} className="bg-gray-950" containerClassName={pageContainerClassName}>
					<div className="mx-auto max-w-5xl">
						<div className="relative isolate overflow-hidden rounded-[1.8rem] border border-blue-950/70 bg-cinder-900/70 px-8 py-14 shadow-[0_24px_80px_rgba(0,0,0,0.28)] ring-1 ring-white/5 sm:px-10 sm:py-16 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-12">
							<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-blue-400/40 to-transparent" />
							<div className="max-w-2xl">
								<h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
									Stop disposable emails at signup
								</h2>
								<p className="mt-4 text-base/8 text-gray-400 sm:text-lg/8">
									Use the free checker to test an email now, or add Gatekeepr to your app to detect disposable emails automatically.
								</p>
							</div>
							<div className="mt-8 flex flex-col items-start gap-3 lg:mt-0 lg:shrink-0">
								<Link
									href="/get-free-api-key"
									className="inline-flex min-w-56 items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-base font-semibold text-white hover:bg-blue-500"
								>
									Start Free
									<ArrowRightIcon className="size-5" />
								</Link>
								<p className="text-sm text-gray-400">No credit card required. 1,000 free checks included.</p>
							</div>
						</div>
					</div>
				</Section>

				<FAQ
					title="Disposable Email Checker FAQ"
					items={faqs}
					containerClassName={pageContainerClassName}
				/>
			</main>

			<Footer withBorder={true} />
		</div>
	)
}
