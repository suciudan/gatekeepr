export default async function(req, res, next) {
	req.ctx = {
		halt: false,
		performance: {},
		threats: [],
		trust: [],
		blocklists: [],
		info: {},
		payload: {
			email: req.body?.email?.trim(),
			ip: req.body?.ip?.trim(),
			user_agent: req.body?.user_agent?.trim()
		}
	}
	return next()
}
