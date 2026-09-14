"use client"

import {
	CheckCircleIcon,
	ExclamationTriangleIcon,
	MagnifyingGlassIcon,
	XCircleIcon
} from "@heroicons/react/24/solid"
import Script from "next/script"
import { useEffect, useRef, useState } from "react"
import clsx from "clsx"

import tryNow from "@/actions/tryNow"
import Loader from "@/components/Loader"

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAADHpgOHjxTohJkkI"

const resultStyles = {
	disposable: {
		title: "Result: Disposable email detected",
		description: "This address appears to use a temporary or throwaway email provider. You may want to block it or require additional verification.",
		icon: XCircleIcon,
		cardClassName: "border-rose-500/25 bg-rose-500/10",
		iconClassName: "text-rose-300",
		labelClassName: "text-rose-100",
		tagClassName: "border-rose-500/25 bg-rose-500/10 text-rose-100"
	},
	clean: {
		title: "Result: No disposable email detected",
		description: "This email does not match known disposable email signals. For production signup protection, combine email checks with IP and device signals.",
		icon: CheckCircleIcon,
		cardClassName: "border-emerald-500/25 bg-emerald-500/10",
		iconClassName: "text-emerald-300",
		labelClassName: "text-emerald-100",
		tagClassName: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
	},
	suspicious: {
		title: "Result: Suspicious email",
		description: "This email was not confirmed as disposable, but it may still need additional verification based on format, domain, or signup context.",
		icon: ExclamationTriangleIcon,
		cardClassName: "border-amber-500/25 bg-amber-500/10",
		iconClassName: "text-amber-300",
		labelClassName: "text-amber-100",
		tagClassName: "border-amber-500/25 bg-amber-500/10 text-amber-100"
	},
	invalid: {
		title: "Result: Invalid email",
		description: "This email address is not formatted correctly or cannot be checked.",
		icon: ExclamationTriangleIcon,
		cardClassName: "border-white/10 bg-white/5",
		iconClassName: "text-cinder-200",
		labelClassName: "text-white",
		tagClassName: "border-white/10 bg-white/5 text-cinder-100"
	}
}

function normalizeInput(value) {
	const input = value.trim().toLowerCase()
	if(!input) return null
	if(input.includes("@")) return input

	const domain = input
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.split("/")[0]

	if(!domain || !domain.includes(".")) return null

	return `check@${domain}`
}

function classifyResult(payload) {
	const threats = Array.isArray(payload?.threats) ? payload.threats : []

	if(threats.includes("email_disposable") || threats.includes("domain_mx_disposable_infra")) {
		return "disposable"
	}

	if(payload?.status === "allow") return "clean"
	if(payload?.status === "challenge" || payload?.status === "block") return "suspicious"

	return "invalid"
}

export default function DisposableEmailChecker({ ip = null }) {
	const [value, setValue] = useState("")
	const [result, setResult] = useState(null)
	const [loading, setLoading] = useState(false)
	const [turnstileToken, setTurnstileToken] = useState("")
	const turnstileContainerRef = useRef(null)
	const turnstileWidgetRef = useRef(null)

	function renderTurnstile() {
		if(typeof window === "undefined") return
		if(!window.turnstile || !turnstileContainerRef.current || turnstileWidgetRef.current) return

		turnstileWidgetRef.current = window.turnstile.render(turnstileContainerRef.current, {
			sitekey: TURNSTILE_SITE_KEY,
			theme: "dark",
			size: "flexible",
			callback: (token) => setTurnstileToken(token),
			"expired-callback": () => setTurnstileToken(""),
			"error-callback": () => setTurnstileToken("")
		})
	}

	function resetTurnstile() {
		setTurnstileToken("")
		if(typeof window === "undefined") return
		if(window.turnstile && turnstileWidgetRef.current) {
			window.turnstile.reset(turnstileWidgetRef.current)
		}
	}

	useEffect(() => {
		renderTurnstile()
	}, [])

	async function onSubmit(event) {
		event.preventDefault()

		const email = normalizeInput(value)
		if(!email) {
			setResult({
				type: "invalid",
				signals: ["Invalid input"]
			})
			return
		}

		if(!turnstileToken) {
			setResult({
				type: "invalid",
				signals: ["Please complete verification"]
			})
			return
		}

		setLoading(true)
		setResult(null)

		const response = await tryNow({
			email,
			ip,
			turnstileToken,
			user_agent: typeof navigator === "undefined" ? null : navigator.userAgent
		})
		resetTurnstile()

		if(response?.error) {
			setResult({
				type: response.field === "email" ? "invalid" : "suspicious",
				signals: [response.message || "Unable to check email"]
			})
			setLoading(false)
			return
		}

		const payload = response?.payload
		const type = classifyResult(payload)
		const threats = Array.isArray(payload?.threats) ? payload.threats : []
		const trust = Array.isArray(payload?.trust) ? payload.trust : []
		const signals = [
			payload?.status ? `status: ${payload.status}` : null,
			...threats.slice(0, 3),
			...trust.slice(0, Math.max(0, 3 - threats.length))
		].filter(Boolean)

		setResult({
			type,
			signals: signals.length ? signals : ["No matching disposable signal"]
		})
		setLoading(false)
	}

	const activeResult = result ? resultStyles[result.type] : null
	const ResultIcon = activeResult?.icon

	return (
		<div className="relative overflow-hidden rounded-[1.8rem] border border-blue-950/70 bg-cinder-900/75 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.38)] ring-1 ring-white/5 sm:p-6">
			<Script
				src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
				strategy="afterInteractive"
				onLoad={renderTurnstile}
			/>
			<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-blue-400/40 to-transparent" />
			<div className="absolute -right-12 top-8 -z-10 h-40 w-40 rounded-full bg-blue-600/16 blur-3xl" />
			<div className="absolute left-8 bottom-0 -z-10 h-36 w-36 rounded-full bg-violet-500/10 blur-3xl" />

			<form onSubmit={onSubmit}>
				<label className="text-sm font-semibold text-white" htmlFor="disposable-email-checker-input">
					Email address or domain
				</label>
				<div className="mt-3 flex flex-col gap-3">
					<input
						id="disposable-email-checker-input"
						type="text"
						value={value}
						onChange={(event) => setValue(event.target.value)}
						placeholder="user@example.com"
						className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-gray-950 px-4 py-3 text-base text-white outline-none transition-all placeholder:text-cinder-400 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10"
					/>
					<div ref={turnstileContainerRef} className="min-h-[65px]" />
					<button
						type="submit"
						disabled={loading || !turnstileToken}
						className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
					>
						{loading ? (
							<Loader className="size-4" />
						) : (
							<MagnifyingGlassIcon className="size-5" />
						)}
						Check Email
					</button>
				</div>
				<p className="mt-3 text-sm text-cinder-300">
					Instant disposable email check. No signup required.
				</p>
			</form>
			{activeResult && (
				<div
					className={clsx(
						"mt-5 rounded-2xl border p-5 transition-all",
						activeResult ? activeResult.cardClassName : "border-white/8 bg-black/20"
					)}
				>
					<div className="flex items-start gap-3">
						<ResultIcon className={clsx("mt-0.5 size-6 shrink-0", activeResult.iconClassName)} />
						<div className="min-w-0">
							<h2 className={clsx("text-lg font-semibold", activeResult.labelClassName)}>
								{activeResult.title}
							</h2>
							<p className="mt-2 text-sm/7 text-cinder-100">
								{activeResult.description}
							</p>
						</div>
					</div>
					<div className="mt-4 flex flex-wrap gap-2">
						{result.signals.map((signal) => (
							<span
								key={signal}
								className={clsx("rounded-full border px-3 py-1 text-xs font-semibold", activeResult.tagClassName)}
							>
							{signal}
						</span>
						))}
					</div>
				</div>
			)}
		</div>
	)
}
