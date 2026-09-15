import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const coreRequire = createRequire(new URL("../packages/core/package.json", import.meta.url))
const { SESv2Client, SendEmailCommand } = await import(pathToFileURL(coreRequire.resolve("@aws-sdk/client-sesv2")))

test("the mail helper compiles the OTP template through Nodemailer's SES transport", async (t) => {
	let request
	// Replace the SDK boundary: this test must never send mail or use AWS credentials.
	t.mock.method(SESv2Client.prototype, "send", async (command) => {
		assert.ok(command instanceof SendEmailCommand)
		request = command.input
		return { MessageId: "synthetic-message-id" }
	})
	t.mock.method(console, "log", () => {})
	const { sendEmail } = await import("../packages/core/src/mail.js")
	const sent = await sendEmail({
		from: "sender@example.test",
		to: "recipient@example.test",
		subject: "Synthetic OTP test",
		template: "otp-email",
		templateProps: { otp: "123456" },
	})
	assert.equal(sent, true)
	assert.deepEqual(request.Destination.ToAddresses, ["recipient@example.test"])
	const message = Buffer.from(request.Content.Raw.Data).toString("utf8")
	assert.match(message, /Subject: Synthetic OTP test/)
	assert.match(message, /123456/)
})
