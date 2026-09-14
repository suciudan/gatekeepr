import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2"
import nodemailer from "nodemailer"

import getOtpEmailHtml from "./emails/otpEmail.js"
import logger from "./logger.js"

const sesClient = new SESv2Client({
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
	},
	region: "eu-central-1"
})

const transporter = nodemailer.createTransport({
	SES: { sesClient, SendEmailCommand },
})

const templates = {
	"otp-email": getOtpEmailHtml
}

export const sendEmail = async ({ from, to, subject, template, templateProps = {} }) => {
	
	if(!templates[template]) {
		await logger(`email: Unable to find template '${template}'`, process.env.SLACK_ERRORS_SITE)
		return false
	}
	
	const html = templates[template](templateProps)
	
	try {
		const info = await transporter.sendMail({
			from: {
				name: "Gatekeepr",
				address: from
			},
			to,
			subject,
			html,
			ses: {},
		})
		console.log(info)
		return true
	} catch(err) {
		await logger(`email: ${err.message}`, process.env.SLACK_ERRORS_SITE)
		return false
	}
}
