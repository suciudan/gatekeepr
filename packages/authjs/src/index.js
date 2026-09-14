export const DEFAULT_GATEKEEPR_URL = "https://api.gatekeepr.io"
export const DEFAULT_REJECT_STATUSES = ["block"]

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

export const createGatekeeprAuth = ({
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
		checkSignIn: (params, options = {}) => {
			return checkAuthJsSignIn(params, {
				client: resolvedClient,
				...defaults,
				...options
			})
		},
		signIn(params) {
			return authJsSignIn(params, {
				client: resolvedClient,
				...defaults
			})
		},
		callbacks(existingCallbacks = {}) {
			return createGatekeeprCallbacks(existingCallbacks, {
				client: resolvedClient,
				...defaults
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

export const getRequestHeaders = (request, headers) => {
	return headers || request?.headers
}

export const getClientIp = (headers) => {
	for(const header of IP_HEADERS) {
		const value = getHeaderValue(headers, header)
		const ip = parseForwardedIp(value, header)
		if(ip) return ip
	}

	return undefined
}

export const getRequestUserAgent = (request, headers) => {
	return getHeaderValue(getRequestHeaders(request, headers), "user-agent")
}

export const authJsSignInToGatekeeprPayload = async (params = {}, {
	email,
	ip,
	userAgent,
	request,
	headers,
	getEmail,
	getIp,
	getUserAgent
} = {}) => {
	const resolvedHeaders = getRequestHeaders(request, headers)

	return cleanGatekeeprPayload({
		email: email || await resolveAuthJsEmail(params, getEmail),
		ip: ip || (getIp ? await getIp(params, request, resolvedHeaders) : getClientIp(resolvedHeaders)),
		user_agent: userAgent || (getUserAgent ? await getUserAgent(params, request, resolvedHeaders) : getRequestUserAgent(request, resolvedHeaders))
	})
}

export const checkAuthJsSignIn = async (params = {}, {
	client,
	gatekeeprApiKey,
	gatekeeprBaseUrl,
	fetcher,
	timeoutMs,
	rejectStatuses = DEFAULT_REJECT_STATUSES,
	missingEmail = "allow",
	blockResult = false,
	...payloadOptions
} = {}) => {
	const payload = await authJsSignInToGatekeeprPayload(params, payloadOptions)

	if(!payload.email) {
		if(missingEmail === "block") {
			return createAuthJsDecision({
				allowed: false,
				status: "missing_email",
				payload,
				result: resolveBlockResult(blockResult, { status: "missing_email" }, params)
			})
		}

		return createAuthJsDecision({
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

	return createAuthJsDecision({
		allowed: !shouldReject,
		status: gatekeepr.status,
		gatekeepr,
		payload,
		result: shouldReject ? resolveBlockResult(blockResult, gatekeepr, params) : true
	})
}

export const authJsSignIn = async (params = {}, options = {}) => {
	const decision = await checkAuthJsSignIn(params, options)
	return decision.result
}

export const createGatekeeprSignInCallback = (options = {}) => {
	return function gatekeeprSignIn(params) {
		return authJsSignIn(params, options)
	}
}

export const createGatekeeprCallbacks = (callbacks = {}, options = {}) => {
	const existingSignIn = callbacks.signIn

	return {
		...callbacks,
		signIn: composeSignInCallbacks(
			createGatekeeprSignInCallback(options),
			existingSignIn
		)
	}
}

export const composeSignInCallbacks = (...callbacks) => {
	const activeCallbacks = callbacks.filter(Boolean)

	return async function composedSignIn(params) {
		for(const callback of activeCallbacks) {
			const result = await callback(params)
			if(result !== true) return result
		}

		return true
	}
}

export const createAuthJsDecision = ({
	allowed,
	status,
	gatekeepr,
	payload,
	result = true
}) => {
	return {
		allowed,
		status,
		gatekeepr,
		payload,
		result: allowed ? true : result
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

const resolveAuthJsEmail = async (params, getEmail) => {
	if(getEmail) return getEmail(params)

	return params?.user?.email ||
		params?.profile?.email ||
		params?.account?.email ||
		params?.credentials?.email
}

const resolveBlockResult = (blockResult, gatekeepr, params) => {
	return typeof blockResult === "function" ? blockResult(gatekeepr, params) : blockResult
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
