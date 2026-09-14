import { measurePerformance } from "@repo/core/performance"

import { agents } from "../../config/agents.js"

export const createNotBrowserCheck = ({ agentsList = agents } = {}) => {
	return async function notBrowserCheck(ctx) {
		const { user_agent } = ctx.payload

		if(!user_agent) return

		let start
		if(measurePerformance()) start = performance.now()

		const isMatch = agentsList.some(agent => user_agent.includes(agent))

		if(!isMatch) {
			if(measurePerformance()) ctx.performance.ua_not_scraper = performance.now() - start
			return
		}

		ctx.threats.push("ua_is_scraper")
		if(measurePerformance()) ctx.performance.ua_is_scraper = performance.now() - start
	}
}

export const notBrowserCheck = createNotBrowserCheck()
