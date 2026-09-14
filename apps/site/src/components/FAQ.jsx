"use client"

import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react"
import { MinusIcon, PlusIcon } from "@heroicons/react/24/solid"
import clsx from "clsx"
import { useState } from "react"
import Section from "@/components/Section"
import SectionTitle from "@/components/Section/SectionTitle"

const defaultFaqs = [
	{
		question: "What data does Gatekeepr need to evaluate a signup?",
		answer: (
			<>
				<p>Gatekeepr works best with three inputs collected during signup:</p>
				<ul>
					<li>Email</li>
					<li>IP address</li>
					<li>User agent</li>
				</ul>
				<p>
					Email is the core input. IP address and user agent add extra context that helps detect disposable
					signups, repeat trial abuse, hosting-provider traffic, relays, and other suspicious patterns.
				</p>
				<p>You can start with the data you already collect and expand over time for better accuracy.</p>
			</>
		),
	},
	{
		question: "Can I run Gatekeepr in shadow mode first?",
		answer: (
			<>
				<p>Yes. Gatekeepr can be used in shadow mode before you enforce any decisions.</p>
				<p>
					In shadow mode, your application still allows the signup, but Gatekeepr returns its decision in the
					background so you can review how it would behave in production.
				</p>
				<p>This is the safest way to:</p>
				<ul>
					<li>measure fake signup volume</li>
					<li>inspect allow / challenge / block decisions</li>
					<li>tune your flow before enforcement</li>
					<li>reduce false-positive risk</li>
				</ul>
				<p>For most teams, shadow mode is the best way to get started.</p>
			</>
		)
	},
	{
		question: "What happens when a signup is marked as challenge?",
		answer: (
			<>
				<p>
					A <strong>challenge</strong> decision means the signup looks suspicious, but not suspicious enough
					to block immediately.
				</p>
				<p>Instead of rejecting the user, you can add a lightweight extra step such as:</p>
				<ul>
					<li>force OAuth if available (for example, Google sign-in for Gmail addresses)</li>
					<li>work-email requirement</li>
					<li>manual review for higher-risk flows</li>
				</ul>
				<p>
					This helps you stop low-quality or abusive signups without adding friction to every legitimate user.
				</p>
			</>
		)
	},
	{
		question: "Does Gatekeepr store email addresses or request data?",
		answer: (
			<>
				<p>Gatekeepr is designed to minimize data handling and limit what is retained.</p>
				<p>
					Signup inputs are processed to return a decision, and data retention should be kept as limited as
					possible based on operational, security, and debugging needs. For exact handling details, retention
					rules, and subprocessors, refer to the Privacy Policy, Terms, and DPA.
				</p>
				<p>This gives teams a clear way to review how data is processed before going live.</p>
			</>
		)
	},
	{
		question: "How fast is the API response?",
		answer: (
			<>
				<p>
					Gatekeepr is built for real-time signup flows and returns decisions fast enough to sit directly in
					the registration path.
				</p>
				<p>
					In most integrations, the API is used synchronously during signup so your application can
					immediately decide whether to allow, challenge, or block the request.
				</p>
				<p>
					Average response time: under 200 ms
				</p>
			</>
		)
	},
	{
		question: "Can I use Gatekeepr with my existing backend or auth flow?",
		answer: (
			<>
				<p>Yes. Gatekeepr is a simple REST API, so it can be added to almost any signup flow.</p>
				<p>You can use it with:</p>
				<ul>
					<li>custom backends</li>
					<li>SaaS products</li>
					<li>auth services</li>
					<li>onboarding flows</li>
					<li>waitlists</li>
					<li>free-trial registration flows</li>
				</ul>
				<p>
					A common setup is to call Gatekeepr right before account creation, then decide whether to allow the
					signup, add a challenge step, or block it.
				</p>
			</>
		)
	}
]

function Answer({ children }) {
	if (typeof children === "string") {
		return <p>{children}</p>
	}

	return children
}

export default function FAQ({
	title = "Frequently Asked Questions",
	items = defaultFaqs,
	containerClassName,
	contentClassName = "relative isolate mx-auto max-w-4xl"
}) {
	const [openQuestion, setOpenQuestion] = useState("")

	return (
		<Section id="faq" className="bg-gray-950" containerClassName={containerClassName}>
			<div className={contentClassName}>
				<div className="absolute left-8 top-8 -z-10 h-44 w-44 rounded-full bg-blue-600/12 blur-3xl" />
				<div className="absolute right-0 top-24 -z-10 h-52 w-52 rounded-full bg-indigo-500/10 blur-3xl" />
				<SectionTitle>{title}</SectionTitle>
				<dl className="mt-8 space-y-4 sm:mt-16">
							{items.map((faq) => {
								const isOpen = openQuestion === faq.question

								return (
									<Disclosure
										key={faq.question}
										as="div"
										className={clsx(
											"rounded-[1.6rem] border px-5 py-4 transition-all duration-200 sm:px-6 sm:py-5",
											isOpen
												? "border-blue-500/25 bg-white/[0.05] shadow-[0_18px_50px_rgba(15,23,42,0.25)]"
												: "border-white/8 bg-black/20 hover:border-blue-500/20 hover:bg-white/[0.04]"
										)}
									>
										<dt>
											<DisclosureButton
												className="flex w-full items-center justify-between gap-6 text-left text-white transition-all cursor-pointer hover:text-blue-100"
												onClick={() => setOpenQuestion((current) => current === faq.question ? "" : faq.question)}
											>
												<span className="text-base/7 font-semibold sm:text-lg/7">{faq.question}</span>
												<span
													className={clsx(
														"flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all sm:h-8 sm:w-8",
														isOpen
															? "border-blue-500/30 bg-blue-500/10 text-blue-200"
															: "border-white/10 bg-white/5 text-blue-300"
													)}
												>
													{isOpen ? (
														<MinusIcon aria-hidden="true" className="size-3.5" />
													) : (
														<PlusIcon aria-hidden="true" className="size-3.5" />
													)}
												</span>
											</DisclosureButton>
										</dt>
										<DisclosurePanel
											as="dd"
											static={isOpen}
											className={clsx("pr-4", !isOpen && "hidden")}
										>
											<div
												className={clsx(
													"mt-4 flex flex-col gap-3 text-base/7 text-gray-300",
													"[&>p]:text-base/7 [&>p]:text-gray-300",
													"[&>ul]:list-disc [&>ul]:space-y-2 [&>ul]:pl-5 [&>ul]:text-cinder-100"
												)}
											>
												<Answer>{faq.answer}</Answer>
											</div>
										</DisclosurePanel>
									</Disclosure>
								)
							})}
				</dl>
			</div>
		</Section>
	)
}
