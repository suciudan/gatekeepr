"use server"

import isEmail from "validator/lib/isEmail"

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

async function verifyTurnstileToken(token) {
	const secret = process.env.TURNSTILE_SECRET_KEY
	if(!secret) {
		return {
			success: false,
			message: "Verification is not configured."
		}
	}

	if(!token) {
		return {
			success: false,
			message: "Please complete verification."
		}
	}

	try {
		const form = new FormData()
		form.append("secret", secret)
		form.append("response", token)

		const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
			method: "POST",
			body: form
		})
		if(!response.ok) {
			return {
				success: false,
				message: "Verification failed. Please try again."
			}
		}

		const payload = await response.json()
		return {
			success: payload?.success === true,
			message: payload?.success === true ? null : "Verification failed. Please try again."
		}
	} catch(err) {
		console.log(`turnstile verification failed: ${err.message}`)
		return {
			success: false,
			message: "Verification failed. Please try again."
		}
	}
}

export default async function tryNow({ email, ip = null, user_agent = null, turnstileToken = null }) {

	// @todo rate limiter
	
	if(!email) {
		return { error: true, field: "email", message: "Please enter an email address." }
	}
	
	if(!isEmail(email)) {
		return { error: true, field: "email", message: "Please enter a valid email address." }
	}

	const turnstile = await verifyTurnstileToken(turnstileToken)
	if(!turnstile.success) {
		return {
			error: true,
			field: "turnstile",
			message: turnstile.message
		}
	}
	
	try {
		const body = { email }

		if(ip) body.ip = ip
		if(user_agent) body.user_agent = user_agent

		const res = await fetch(process.env.GATEKEEPR_API_URL || "https://api.gatekeepr.io", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": process.env.API_KEY
			},
			body: JSON.stringify(body)
		})
		const json = await res.json()
		return {
			success: true,
			payload: json
		}
	} catch(err) {
		console.log(err)
		return {
			error: true,
			message: "Something went wrong. Please try again later."
		}
	}

}
