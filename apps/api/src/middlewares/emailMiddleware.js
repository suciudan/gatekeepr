import { emailRfc5322Check } from "../checks/email/rfc5322.js"

export default async function (req, res, next) {
	
	if(!req.body?.email) return res.status(400).json({ error: "email_required" })
	
	await emailRfc5322Check(req.ctx)
	
	if(req.ctx.trust.includes("email_passes_rfc5322") === false) return res.status(400).json({ error: "email_invalid" })
	
	return next()

}
