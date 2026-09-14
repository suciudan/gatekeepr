export const DEFAULT_GATEKEEPR_URL = "https://api.gatekeepr.io"
export const DEFAULT_REJECT_STATUSES = ["block"]
export const DEFAULT_EMAIL_PATHS = ["email", "user.email"]

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

export const createGatekeeprNext = ({
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
		checkRequest: (request, options = {}) => {
			return checkNextRequest(request, {
				client: resolvedClient,
				...defaults,
				...options
			})
		},
		protectRoute(handler, options = {}) {
			return createProtectedRoute(handler, {
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

export const getClientIp = (headers) => {
	for(const header of IP_HEADERS) {
		const value = getHeaderValue(headers, header)
		const ip = parseForwardedIp(value, header)
		if(ip) return ip
	}

	return undefined
}

export const getRequestHeaders = (request, headers) => {
	return headers || request?.headers
}

export const getRequestUserAgent = (request, headers) => {
	return getHeaderValue(getRequestHeaders(request, headers), "user-agent")
}

export const buildNextGatekeeprPayload = async (request, {
	email,
	ip,
	userAgent,
	headers,
	getEmail,
	getIp,
	getUserAgent,
	emailPaths = DEFAULT_EMAIL_PATHS
} = {}) => {
	const resolvedHeaders = getRequestHeaders(request, headers)
	const resolvedEmail = email || await resolveEmail(request, {
		getEmail,
		emailPaths
	})

	return cleanGatekeeprPayload({
		email: resolvedEmail,
		ip: ip || (getIp ? await getIp(request, resolvedHeaders) : getClientIp(resolvedHeaders)),
		user_agent: userAgent || (getUserAgent ? await getUserAgent(request, resolvedHeaders) : getRequestUserAgent(request, resolvedHeaders))
	})
}

export const checkNextRequest = async (request, {
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
	const payload = await buildNextGatekeeprPayload(request, payloadOptions)

	if(!payload.email) {
		if(missingEmail === "block") {
			const message = typeof blockMessage === "function" ? blockMessage({ status: "missing_email" }, request) : blockMessage

			return createNextDecision({
				allowed: false,
				status: "missing_email",
				payload,
				message,
				httpCode: blockHttpCode,
				includeGatekeeprResult
			})
		}

		return createNextDecision({
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
	const message = typeof blockMessage === "function" ? blockMessage(gatekeepr, request) : blockMessage

	return createNextDecision({
		allowed: !shouldReject,
		status: gatekeepr.status,
		gatekeepr,
		payload,
		message,
		httpCode: blockHttpCode,
		includeGatekeeprResult
	})
}

export const createNextDecision = ({
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

	decision.response = createBlockedResponse({
		status,
		gatekeepr,
		message,
		httpCode,
		includeGatekeeprResult
	})

	return decision
}

export const createBlockedResponse = ({
	status,
	gatekeepr,
	message = "Request blocked by Gatekeepr.",
	httpCode = 403,
	includeGatekeeprResult = false
} = {}) => {
	const body = {
		error: "gatekeepr_blocked",
		message,
		status
	}

	if(gatekeepr?.threats) body.threats = gatekeepr.threats
	if(includeGatekeeprResult && gatekeepr) body.gatekeepr = gatekeepr

	return Response.json(body, { status: httpCode })
}

export const createProtectedRoute = (handler, options = {}) => {
	if(typeof handler !== "function") throw new TypeError("handler must be a function")

	return async function gatekeeprProtectedRoute(request, context) {
		const decision = await checkNextRequest(request, options)
		if(!decision.allowed) return decision.response

		return handler(request, context, decision)
	}
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

export const getValueAtPath = (value, path) => {
	if(!value || !path) return undefined

	return String(path).split(".").reduce((current, key) => {
		if(current == null) return undefined
		return current[key]
	}, value)
}

const resolveEmail = async (request, {
	getEmail,
	emailPaths
} = {}) => {
	if(getEmail) return getEmail(request)

	const body = await readRequestBody(request)
	for(const path of emailPaths) {
		const value = getValueAtPath(body, path)
		if(value) return value
	}

	return undefined
}

const readRequestBody = async (request) => {
	if(!request || !request.headers || !request.clone) return {}

	const contentType = getHeaderValue(request.headers, "content-type") || ""
	const clone = request.clone()

	try {
		if(contentType.includes("application/json")) return await clone.json()
		if(contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
			return Object.fromEntries(await clone.formData())
		}
	} catch(err) {
		return {}
	}

	return {}
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
