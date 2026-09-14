"use client"

import Input from "@/components/Form/Input"
import { useState } from "react"
import Link from "next/link"

import { sendOtpCode } from "@/actions/otpCode"
import { redirect } from "next/navigation"

export default function AuthEmailForm({ terms = true, placeholder = "No spam, no marketing, just your API key." }) {
	
	const [loading, setLoading] = useState(false)
	const [email, setEmail] = useState("")
	const [error, setError] = useState(null)
	
	const onSubmit = async (event) => {
		event.preventDefault()
		if(loading) return
		setLoading(true)
		setError(null)
		const res = await sendOtpCode(email)
		if(res.error) {
			setError(res.error)
			setLoading(false)
			return
		}
		return redirect(res.redirectTo)
	}
	
	return (
		<form method="POST" action="#" className="flex flex-col gap-3 justify-center" onSubmit={onSubmit}>
			<Input
				className="w-full"
				type="email"
				label="Email"
				placeholder={placeholder}
				inlineSubmit={true}
				loading={loading}
				onChange={setEmail}
				value={email}
				error={error}
			/>
			{terms && (
				<p className="text-gray-200 text-sm">
					By creating an account, you agree to our{" "}
					<Link
						className="text-blue-600 underline hover:no-underline font-semibold"
						href="/legal/terms-of-service"
						target="_blank"
					>Terms of Service</Link>.
				</p>
			)}
		</form>
	)
}