import { BLOCKING_THREATS } from "../config/status.js"

export const resolveFraudStatus = (threats = []) => {
	if(threats.length === 0) return "allow"
	for(const threat of threats) {
		if(BLOCKING_THREATS.has(threat)) {
			return "block"
		}
	}
	return "challenge"
}
