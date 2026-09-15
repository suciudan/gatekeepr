"use client"

import { useState, useRef, useMemo, useEffect } from "react"
import { useSearchParams, redirect } from "next/navigation"
import clsx from "clsx"

import Loader from "@/components/Loader"

import { verifyOtpCode } from "@/actions/otpCode"
import { OTP_LENGTH } from "@/config/constants"

export default function AuthVerifyEmailForm() {
	
	const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(""))
	const [error, setError] = useState(null)
	const [loading, setLoading] = useState(false)
	const inputsRef = useRef([])
	const otp = useMemo(() => digits.join(""), [digits])
	const searchParamsList = useSearchParams()

	useEffect(() => {
		inputsRef.current[0]?.focus()
	}, [])
	
	if(!searchParamsList.get("email")) return redirect("/get-free-api-key")
	
	const focusAt = idx => {
		if(idx >= 0 && idx < OTP_LENGTH) {
			inputsRef.current[idx]?.focus()
			inputsRef.current[idx]?.select?.()
		}
	}
	
	const setDigitAt = (idx, val) => {
		setDigits(prev => {
			const next = [...prev]
			next[idx] = val
			return next
		})
	}
	
	const handleChange = (e, idx) => {
		const val = e.target.value
		// accept only 0-9; ignore others
		const char = val.replace(/\D/g, "").slice(0, 1)
		setDigitAt(idx, char)
		if(char && idx < OTP_LENGTH - 1) focusAt(idx + 1)
		if(char && idx === OTP_LENGTH - 1) {
			inputsRef?.current[OTP_LENGTH - 1]?.blur()
		}
	}
	
	const handleKeyDown = (e, idx) => {
		
		const key = e.key
		
		// Paste command
		if(key.toLowerCase() === "v" && (e.ctrlKey === true || e.metaKey === true)) {
			return
		}
		
		if(key === "Backspace") {
			if(digits[idx]) {
				// delete current digit
				setDigitAt(idx, "")
			} else {
				// current empty: move left and clear previous safely
				const prevIdx = Math.max(idx - 1, 0)
				if(prevIdx !== idx) {
					setDigitAt(prevIdx, "")
					focusAt(prevIdx)
				}
			}
			e.preventDefault()
			return
		}
		
		if(key === "Delete") {
			// Clear current and keep focus
			if (digits[idx]) setDigitAt(idx, "")
			e.preventDefault()
			return
		}
		
		if(key === "ArrowLeft") {
			focusAt(Math.max(idx - 1, 0))
			e.preventDefault()
			return
		}
		
		if(key === "ArrowRight") {
			focusAt(Math.min(idx + 1, OTP_LENGTH - 1))
			e.preventDefault()
			return
		}
		
		if(key.length === 1 && !/\d/.test(key)) {
			// Block non-digits
			e.preventDefault()
		}
	}
	
	const handlePaste = (e, idx) => {
		const pasted = e.clipboardData.getData("text")
		if(!pasted) return
		const onlyDigits = pasted.replace(/\D/g, "").slice(0, OTP_LENGTH)
		if(!onlyDigits) return
		e.preventDefault()
		setDigits(prev => {
			const next = [...prev]
			let writeIdx = idx
			for(let i = 0; i < onlyDigits.length && writeIdx < OTP_LENGTH; i++) {
				next[writeIdx++] = onlyDigits[i]
			}
			return next
		})
		inputsRef.current.map(i => i.blur())
	}
	
	const onSubmit = async (event) => {
		
		event.preventDefault()
		if(loading) return
		
		setLoading(true)
		setError(null)
		
		const res = await verifyOtpCode(searchParamsList.get("email"), otp)
		
		if(res.error) {
			setError(res.error)
			setLoading(false)
			return
		}
		
		return redirect(res.redirectTo)
		
	}
	
	return (
		<form method="POST" action="#" onSubmit={onSubmit}>
			<p className="text-base text-gray-300 mb-6">
				We&apos;ve sent a 6-digit code to your <span className="font-semibold">{searchParamsList.get("email")}</span>.
				Enter it below to verify and generate your API key.
			</p>
			<div className="flex my-4 space-x-1.5 sm:space-x-4 md:my-6">
				{Array.from({ length: OTP_LENGTH }).map((_, i) => (
					<div key={i}>
						<label htmlFor={`code-${i + 1}`} className="sr-only">
							{`Digit ${i + 1}`}
						</label>
						<input
							id={`code-${i + 1}`}
							ref={el => (inputsRef.current[i] = el)}
							type="text"
							inputMode="numeric"
							pattern="[0-9]*"
							autoComplete={i === 0 ? "one-time-code" : "off"}
							maxLength="1"
							value={digits[i]}
							onChange={e => handleChange(e, i)}
							onKeyDown={e => handleKeyDown(e, i)}
							onPaste={e => handlePaste(e, i)}
							placeholder={(i+1).toString()}
							disabled={loading}
							className={clsx(
								"block py-3 font-extrabold text-center rounded-lg sm:py-4 transition-all",
								"text-xl",
								"w-10 h-10 sm:w-12 sm:h-12",
								"border-2 border-slate-700",
								"bg-gray-950  placeholder-gray-700 text-white",
								!loading && "focus:ring-blue-600 focus:border-blue-600 hover:border-blue-500",
								"outline-0"
							
							)}
							required
						/>
					</div>
				))}
			</div>
			{error && (
				<div className="text-sm -mt-2 mb-4 text-red-500 font-bold">{error}</div>
			)}
			<button
				className={clsx(
					"w-full rounded-lg font-bold text-sm transition-all relative",
					"py-3 px-4",
					"border-2 border-blue-600 text-blue-600 w-full",
					!loading && "hover:bg-blue-600 hover:text-white cursor-pointer",
					
				)}
				type="submit"
			>
				<span className={clsx(loading && "opacity-0")}>Verify Your Email</span>
				{loading && (
					<div className="absolute inset-0 flex items-center justify-center">
						<Loader className="size-6" />
					</div>
				)}
			</button>
		</form>
	)
}
