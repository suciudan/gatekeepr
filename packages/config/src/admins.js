function parseAdminEmails(value) {
	if(typeof value !== "string") return []

	return value
		.split(",")
		.map(email => email.trim())
		.filter(Boolean)
}

export const admins = [
	...new Set([
		...parseAdminEmails(process.env.GATEKEEPR_ADMIN_EMAILS)
	])
]
