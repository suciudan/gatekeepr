import knex from "@repo/db/knex"

const findApiKey = async (apiKey) => {
	return knex("user").where({ apiKey }).first()
}

export const createApiKeyMiddleware = ({ findApiKeyByValue = findApiKey } = {}) => {
	return async function apiKeyMiddleware(req, res, next) {
		if(!req.headers.authorization) return res.status(401).json({})

		const apiKeyProps = await findApiKeyByValue(req.headers.authorization)

		if(!apiKeyProps) return res.status(401).json({})
		if(apiKeyProps.disabled === 1) return res.status(418).json({})

		req.api_key = apiKeyProps.apiKey

		return next()
	}
}

export default createApiKeyMiddleware()
