import { checkUsage, logUsage } from "@repo/core/usage"

export const createUsageMiddleware = ({
	checkUsageFn = checkUsage,
	logUsageFn = logUsage
} = {}) => {
	return async function usageMiddleware(req, res, next) {
		const usage = await checkUsageFn(req.api_key)
		if(usage === false) {
			return res.status(402).json({
				error: "You’ve reached your request limit. To continue using the service, please upgrade your subscription."
			})
		}
		await logUsageFn(req.api_key)
		return next()
	}
}

export default createUsageMiddleware()
