import logger from "@repo/core/logger"

export const upgradeAction = async (email, site, requests) => {
	try {
		await logger(`${email}, ${site}, ${requests}`, process.env.SLACK_SITE_UPGRADES)
		return true
	} catch(err) {
		console.log(`upgrade: ${err.message} (${email}, ${site}, ${requests})`)
		return false
	}
}