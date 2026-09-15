"use client"

import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from "@heroicons/react/24/solid"
import { useEffect, useState } from "react"
import clsx from "clsx"

import Loader from "@/components/Loader"

const scenarios = [
	{
		email: "anna+trial@gmail.com",
		status: "challenge",
		title: "Challenge",
		signals: ["Public email", "Tag usage", "Needs verification"]
	},
	{
		email: "anna@tempmailmail.io",
		status: "block",
		title: "Block",
		signals: ["Disposable email", "Instant Block"]
	},
	{
		email: "uanna@acme.io",
		status: "Allow",
		title: "Allow",
		signals: ["Business domain", "Low-risk context", "No suspicious signals"]
	}
]

const TYPE_INTERVAL_MS = 85
const BEFORE_SCAN_DELAY_MS = 500
const SCAN_DURATION_MS = 1100
const RESULT_HOLD_MS = 4500

const statusStyles = {
	allow: {
		cardClassName: "border-emerald-500/20 bg-emerald-500/8",
		labelClassName: "text-emerald-300",
		signalClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-100",
		icon: CheckCircleIcon
	},
	challenge: {
		cardClassName: "border-amber-500/20 bg-amber-500/8",
		labelClassName: "text-amber-300",
		signalClassName: "border-amber-500/20 bg-amber-500/10 text-amber-100",
		icon: ExclamationTriangleIcon
	},
	block: {
		cardClassName: "border-rose-500/20 bg-rose-500/8",
		labelClassName: "text-rose-300",
		signalClassName: "border-rose-500/20 bg-rose-500/10 text-rose-100",
		icon: XCircleIcon
	}
}

export default function HeroTryItNow() {
	const [scenarioIndex, setScenarioIndex] = useState(0)
	const [typedEmail, setTypedEmail] = useState("")
	const [phase, setPhase] = useState("typing")

	useEffect(() => {
		const scenario = scenarios[scenarioIndex]
		const timeouts = []
		let currentIndex = 0

		const typeTimer = setInterval(() => {
			currentIndex += 1
			setTypedEmail(scenario.email.slice(0, currentIndex))

			if(currentIndex >= scenario.email.length) {
				clearInterval(typeTimer)

				timeouts.push(setTimeout(() => {
					setPhase("scanning")

					timeouts.push(setTimeout(() => {
						setPhase("result")

						timeouts.push(setTimeout(() => {
							setTypedEmail("")
							setPhase("typing")
							setScenarioIndex((current) => (current + 1) % scenarios.length)
						}, RESULT_HOLD_MS))
					}, SCAN_DURATION_MS))
				}, BEFORE_SCAN_DELAY_MS))
			}
		}, TYPE_INTERVAL_MS)

		return () => {
			clearInterval(typeTimer)
			timeouts.forEach(clearTimeout)
		}
	}, [scenarioIndex])

	const scenario = scenarios[scenarioIndex]
	const style = statusStyles[scenario.status.toLowerCase()] ?? statusStyles.challenge
	const StatusIcon = style.icon

	return (
		<div className="px-6 text-sm sm:px-0">
			<div className="flex flex-col gap-4">
				<div className="text-base/6 font-bold text-white sm:text-lg/6">
					See it in action:
				</div>

				<div className="rounded-2xl border border-slate-700 bg-gray-950 px-5 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
					<div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-cinder-400">
						<span>Email to check</span>
						<span>{String(scenarioIndex + 1).padStart(2, "0")} / {String(scenarios.length).padStart(2, "0")}</span>
					</div>
					<div className="mt-4 flex min-h-8 items-center">
						<span className="min-w-0 break-all text-lg font-medium text-white sm:text-xl">
							{typedEmail}
						</span>
						<span
							className={clsx(
								"ml-1 inline-block h-6 w-px bg-blue-400 transition-opacity",
								phase === "result" ? "opacity-0" : "animate-pulse opacity-100"
							)}
						/>
					</div>
					<div className="mt-4 flex items-center gap-3 text-sm">
						{phase === "typing" && (
							<span className="text-cinder-300">Typing sample email…</span>
						)}
						{phase === "scanning" && (
							<>
								<Loader className="size-4 text-blue-500" />
								<span className="text-blue-300">Analyzing email, network, and user agent…</span>
							</>
						)}
						{phase === "result" && (
							<span className="text-cinder-300">Decision ready.</span>
						)}
					</div>
				</div>

				<div
					className={clsx(
						"rounded-2xl border p-5 transition-all duration-300",
						phase === "result" ? style.cardClassName : "border-white/8 bg-cinder-900/60",
						phase !== "result" && "opacity-70"
					)}
				>
					<div>
						<div className="text-xs font-semibold uppercase tracking-[0.16em] text-cinder-300">
							Signup decision
						</div>
						{phase === "result" ? (
							<>
								<div className={clsx("mt-2 flex items-center gap-2 text-xl font-semibold", style.labelClassName)}>
									<StatusIcon className="size-6 shrink-0" />
									<span>{scenario.title}</span>
								</div>
								<div className="mt-5">
									<div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-cinder-300">
										Signals
									</div>
									<div className="mt-3 flex flex-wrap gap-2">
										{scenario.signals.map((signal) => (
											<span
												key={signal}
												className={clsx(
													"rounded-full border px-3.5 py-1.5 text-sm font-medium",
													style.signalClassName
												)}
											>
												{signal}
											</span>
										))}
									</div>
								</div>
							</>
						) : (
							<>
								<div className="mt-2 text-xl font-semibold text-cinder-200">
									Waiting for result
								</div>
								<div className="mt-5">
									<div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-cinder-400">
										Signals
									</div>
									<div className="mt-3 flex flex-wrap gap-2">
										{scenario.signals.map((signal) => (
											<span
												key={signal}
												className="relative overflow-hidden rounded-full border border-white/8 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-transparent"
											>
												<span className="absolute inset-0 animate-pulse bg-linear-to-r from-transparent via-white/10 to-transparent" />
												{signal}
											</span>
										))}
									</div>
								</div>
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
