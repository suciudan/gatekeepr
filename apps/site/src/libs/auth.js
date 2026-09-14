import "@repo/core/dotenv"

import { nextCookies } from "better-auth/next-js"
import { emailOTP } from "better-auth/plugins"
import { createPool } from "mysql2/promise"
import { betterAuth } from "better-auth"

import { sendEmail } from "@repo/core/mail"

export const auth = betterAuth({
	database: createPool({
		host: process.env.MYSQL_HOST,
		user: process.env.MYSQL_USER,
		password: process.env.MYSQL_PASS,
		database: process.env.MYSQL_DB,
		timezone: "Z", // Important to ensure consistent timezone values
	}),
	plugins: [
		nextCookies(),
		emailOTP({
			async sendVerificationOTP({ email, otp, type }) {
				if(type === "sign-in") {
					await sendEmail({
						from: "dan@gatekeepr.io",
						to: email,
						subject: "Your Gatekeepr Verification Code",
						template: "otp-email",
						templateProps: {
							otp
						}
					})
				}
			},
		}),
	],
	user: {
		additionalFields: {
			website: {
				type: "string",
				required: false,
				defaultValue: null,
				input: true
			},
			apiKey: {
				type: "string",
				required: false,
				defaultValue: null,
				input: false,
			},
			rpm: {
				type: "number",
				required: true,
				defaultValue: 0,
				input: false
			},
			rpmNextReset: {
				type: "date",
				required: false,
				defaultValue: null,
				input: false
			},
			disabled: {
				type: "boolean",
				required: false,
				defaultValue: false,
				input: false
			}
		}
	}
})