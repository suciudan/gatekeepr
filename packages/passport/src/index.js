export const DEFAULT_GATEKEEPR_URL = "https://api.gatekeepr.io"
export const DEFAULT_REJECT_STATUSES = ["block"]
export const DEFAULT_EMAIL_FIELDS = ["email", "username", "user.email"]
export const DEFAULT_EMAIL_SOURCES = ["body", "query", "params", "user", "request"]

export const IP_HEADERS = [
	"cf-connecting-ip",
	"true-client-ip",
	"x-real-ip",
	"x-vercel-forwarded-for",
	"x-forwarded-for",
	"forwarded"
]

export class GatekeeprApiError extends Error {
	constructor(message, { status, body } = {}) {
		super(message)
		this.name = "GatekeeprApiError"
		this.status = status
		this.body = body
	}
}

export const createGatekeeprClient = ({
	apiKey,
	baseUrl = DEFAULT_GATEKEEPR_URL,
	fetcher = globalThis.fetch,
	timeoutMs = 4000
} = {}) => {
	if(!apiKey) throw new TypeError("apiKey is required")
	if(typeof fetcher !== "function") throw new TypeError("fetcher must be a function")

	const url = String(baseUrl).replace(/\/+$/, "")

	return {
		async check(payload, requestOptions = {}) {
			const controller = new AbortController()
			const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null

			try {
				const res = await fetcher(url, {
					method: "POST",
					headers: {
						Authorization: apiKey,
						"Content-Type": "application/json",
						...(requestOptions.headers || {})
					},
					body: JSON.stringify(cleanGatekeeprPayload(payload)),
					signal: requestOptions.signal || controller.signal
				})

				const body = await parseJsonResponse(res)

				if(!res.ok) {
					throw new GatekeeprApiError("Gatekeepr request failed", {
						status: res.status,
						body
					})
				}

				return body
			} finally {
				if(timeout) clearTimeout(timeout)
			}
		}
	}
}

export const createGatekeeprPassport = ({
	apiKey,
	gatekeeprApiKey,
	baseUrl,
	gatekeeprBaseUrl,
	fetcher,
	timeoutMs,
	client,
	...defaults
} = {}) => {
	const resolvedClient = client || createGatekeeprClient({
		apiKey: apiKey || gatekeeprApiKey,
		baseUrl: baseUrl || gatekeeprBaseUrl,
		fetcher,
		timeoutMs
	})

	return {
		client: resolvedClient,
		checkRequest(req, options = {}) {
			return checkPassportRequest(req, {
				client: resolvedClient,
				...defaults,
				...options
			})
		},
		middleware(options = {}) {
			return createGatekeeprPassportMiddleware({
				client: resolvedClient,
				...defaults,
				...options
			})
		}
	}
}

export const cleanGatekeeprPayload = (payload = {}) => {
	const clean = {}

	if(payload.email) clean.email = String(payload.email).trim()
	if(payload.ip) clean.ip = String(payload.ip).trim()
	if(payload.user_agent) clean.user_agent = String(payload.user_agent).trim()
	if(payload.userAgent) clean.user_agent = String(payload.userAgent).trim()

	return clean
}

export const getHeaderValue = (headers, name) => {
	if(!headers) return undefined

	if(typeof headers.get === "function") return headers.get(name) || headers.get(name.toLowerCase())

	const lowerName = name.toLowerCase()
	for(const [key, value] of Object.entries(headers)) {
		if(key.toLowerCase() === lowerName) return Array.isArray(value) ? value[0] : value
	}

	return undefined
}

export const getRequestHeaders = (req, headers) => {
	return headers || req?.headers
}

export const getClientIp = (headers) => {
	for(const header of IP_HEADERS) {
		const value = getHeaderValue(headers, header)
		const ip = parseForwardedIp(value, header)
		if(ip) return ip
	}

	return undefined
}

export const getRequestIp = (req, headers) => {
	const resolvedHeaders = getRequestHeaders(req, headers)
	return getClientIp(resolvedHeaders) ||
		req?.ip ||
		req?.ips?.[0] ||
		req?.socket?.remoteAddress ||
		req?.connection?.remoteAddress
}

export const getRequestUserAgent = (req, headers) => {
	return getHeaderValue(getRequestHeaders(req, headers), "user-agent")
}

export const getRequestFieldValue = (req, fields = DEFAULT_EMAIL_FIELDS, sources = DEFAULT_EMAIL_SOURCES) => {
	const fieldList = Array.isArray(fields) ? fields : [fields]
	const sourceList = Array.isArray(sources) ? sources : [sources]

	for(const sourceName of sourceList) {
		const source = sourceName === "request" ? req : req?.[sourceName]
		if(!source) continue

		for(const field of fieldList) {
			const value = getPathValue(source, field)
			if(value) return value
		}
	}

	return undefined
}

export const passportRequestToGatekeeprPayload = async (req = {}, {
	email,
	ip,
	userAgent,
	headers,
	emailFields = DEFAULT_EMAIL_FIELDS,
	emailSources = DEFAULT_EMAIL_SOURCES,
	getEmail,
	getIp,
	getUserAgent
} = {}) => {
	const resolvedHeaders = getRequestHeaders(req, headers)

	return cleanGatekeeprPayload({
		email: email || (getEmail ? await getEmail(req) : getRequestFieldValue(req, emailFields, emailSources)),
		ip: ip || (getIp ? await getIp(req, resolvedHeaders) : getRequestIp(req, resolvedHeaders)),
		user_agent: userAgent || (getUserAgent ? await getUserAgent(req, resolvedHeaders) : getRequestUserAgent(req, resolvedHeaders))
	})
}

export const checkPassportRequest = async (req = {}, {
	client,
	gatekeeprApiKey,
	gatekeeprBaseUrl,
	fetcher,
	timeoutMs,
	rejectStatuses = DEFAULT_REJECT_STATUSES,
	missingEmail = "allow",
	blockMessage = "Request blocked by Gatekeepr.",
	blockHttpCode = 403,
	includeGatekeeprResult = false,
	...payloadOptions
} = {}) => {
	const payload = await passportRequestToGatekeeprPayload(req, payloadOptions)

	if(!payload.email) {
		if(missingEmail === "block") {
			const message = typeof blockMessage === "function" ? blockMessage({ status: "missing_email" }, req) : blockMessage

			return createPassportDecision({
				allowed: false,
				status: "missing_email",
				payload,
				message,
				httpCode: blockHttpCode,
				includeGatekeeprResult
			})
		}

		return createPassportDecision({
			allowed: true,
			status: "missing_email",
			payload
		})
	}

	const gatekeepr = await (client || createGatekeeprClient({
		apiKey: gatekeeprApiKey,
		baseUrl: gatekeeprBaseUrl,
		fetcher,
		timeoutMs
	})).check(payload)

	const shouldReject = rejectStatuses.includes(gatekeepr.status)
	const message = typeof blockMessage === "function" ? blockMessage(gatekeepr, req) : blockMessage

	return createPassportDecision({
		allowed: !shouldReject,
		status: gatekeepr.status,
		gatekeepr,
		payload,
		message,
		httpCode: blockHttpCode,
		includeGatekeeprResult
	})
}

export const createGatekeeprPassportMiddleware = (options = {}) => {
	return async function gatekeeprPassportMiddleware(req, res, next) {
		try {
			const decision = await checkPassportRequest(req, options)
			if(decision.allowed) return next?.()

			if(typeof options.onReject === "function") {
				return options.onReject(decision, req, res, next)
			}

			return sendPassportBlockedResponse(res, decision)
		} catch(err) {
			if(typeof next === "function") return next(err)
			throw err
		}
	}
}

export const gatekeeprPassportMiddleware = createGatekeeprPassportMiddleware

export const createPassportDecision = ({
	allowed,
	status,
	gatekeepr,
	payload,
	message,
	httpCode = 403,
	includeGatekeeprResult = false
}) => {
	const decision = {
		allowed,
		status,
		gatekeepr,
		payload
	}

	if(allowed) return decision

	decision.response = {
		status: httpCode,
		body: createBlockedBody({
			status,
			gatekeepr,
			message,
			includeGatekeeprResult
		})
	}

	return decision
}

export const createBlockedBody = ({
	status,
	gatekeepr,
	message = "Request blocked by Gatekeepr.",
	includeGatekeeprResult = false
} = {}) => {
	const body = {
		error: "gatekeepr_blocked",
		message,
		status
	}

	if(gatekeepr?.threats) body.threats = gatekeepr.threats
	if(includeGatekeeprResult && gatekeepr) body.gatekeepr = gatekeepr

	return body
}

export const sendPassportBlockedResponse = (res, decision) => {
	const response = decision.response || {
		status: 403,
		body: createBlockedBody(decision)
	}

	if(!res || res.headersSent) return response

	if(typeof res.status === "function") {
		res.status(response.status)
	} else {
		res.statusCode = response.status
	}

	if(typeof res.json === "function") return res.json(response.body)

	if(typeof res.setHeader === "function") res.setHeader("Content-Type", "application/json")
	if(typeof res.end === "function") return res.end(JSON.stringify(response.body))

	return response
}

export const parseForwardedIp = (value, headerName = "") => {
	if(!value) return undefined

	const first = String(value).split(",")[0].trim()
	if(!first) return undefined

	if(headerName.toLowerCase() === "forwarded") {
		const match = first.match(/(?:^|;)\s*for=(?:"?\[?)([^;\]"]+)/i)
		return stripPort(match?.[1])
	}

	return stripPort(first)
}

const getPathValue = (source, path) => {
	if(!path) return undefined

	return String(path).split(".").reduce((value, key) => {
		return value?.[key]
	}, source)
}

const stripPort = (value) => {
	if(!value) return undefined

	const clean = String(value).trim().replace(/^"|"$/g, "")
	if(clean.startsWith("[")) return clean.slice(1).split("]")[0]

	const colonCount = (clean.match(/:/g) || []).length
	if(colonCount === 1 && /:\d+$/.test(clean)) return clean.replace(/:\d+$/, "")

	return clean
}

const parseJsonResponse = async (res) => {
	const text = await res.text()
	if(!text) return {}

	try {
		return JSON.parse(text)
	} catch(err) {
		throw new GatekeeprApiError("Gatekeepr returned invalid JSON", {
			status: res.status,
			body: text
		})
	}
}
