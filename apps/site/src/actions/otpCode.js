"use server"

import isEmail from "validator/lib/isEmail"
import { randomUUID } from "crypto"

import { REQUESTS_FREE_PACKAGE } from "@repo/config/constants"
import logger from "@repo/core/logger"
import redis from "@repo/core/redis"
import knex from "@repo/db/knex"

import { auth } from "@/libs/auth"

/**
 * Validate the email address
 * @param email
 * @returns {{error: string}|boolean}
 */

const validateEmail = (email = null) => {
	if(!email) return { error: "Please enter an email address." }
	if(isEmail(email) === false) return { error: "Please enter a valid email address" }
	return true
}

/**
 * Validate the OTP code
 * @param otp
 * @returns {{error: string}|boolean}
 */

const validateOTP = (otp = null) => {
	const regex = /^[0-9]{6}$/
	if(regex.test(otp) === true) return true
	return { error: "Please enter a valid OTP code." }
}

/**
 * Send an OTP code to the email address
 * @param email
 * @returns {Promise<{error: string}|{error: string}|boolean|{redirectTo: string}>}
 */

export const sendOtpCode = async (email) => {
	
	const invalidEmail = validateEmail(email)
	if(invalidEmail !== true) return invalidEmail
	
	try {
		await auth.api.sendVerificationOTP({
			body: {
				email,
				type: "sign-in"
			},
		})
	} catch(err) {
		await logger(`Unable to send the verification code to ${email}: ${err.message}.`, process.env.SLACK_ERRORS_SITE)
		return { error: "Unable to send the verification code. Please try again later." }
	}
	
	return { redirectTo: `/verify-email?email=${encodeURIComponent(email)}` }
	
}

const generateApiKey = async (id) => {
	const user = await knex("user").where({ id }).first()
	if(user.apiKey) return
	
	const apiKey = randomUUID()
	const rpmNextReset = knex.raw("DATE_ADD(NOW(), INTERVAL 1 MONTH)")
	
	await knex("user")
		.update({
			apiKey,
			rpmNextReset,
			rpm: REQUESTS_FREE_PACKAGE
		})
		.where({ id })
	
	await redis.set(`api_usage:${apiKey}`, REQUESTS_FREE_PACKAGE)
	
}

/**
 * Verify the OTP code
 * @param email
 * @param otp
 * @returns {Promise<{error: string}|{error: string}|boolean|{redirectTo: string}>}
 */

export const verifyOtpCode = async (email, otp) => {
	
	const invalidEmail = validateEmail(email)
	if(invalidEmail !== true) return invalidEmail
	
	const invalidOtp = validateOTP(otp)
	if(invalidOtp !== true) return invalidOtp
	
	try {
		const data = await auth.api.signInEmailOTP({
			body: {
				email,
				otp,
			}
		})
		if(data?.user?.id) await generateApiKey(data.user.id)
		return { redirectTo: "/dashboard" }
	} catch(err) {
		if(err.code === "OTP_EXPIRED") return { error: "The code you are trying to use is expired." }
		if(err.code === "TOO_MANY_ATTEMPTS") return { error: "You entered a wrong code for too many times. Slow down and try again later." }
		return { error: "The code you are trying to use is not valid." }
	}
	
}