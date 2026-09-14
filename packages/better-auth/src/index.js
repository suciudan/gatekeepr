export const DEFAULT_GATEKEEPR_URL = "https://api.gatekeepr.io"
export const DEFAULT_REJECT_STATUSES = ["block"]
export const DEFAULT_MATCH_PATHS = ["/sign-up/email", "/sign-in/email"]

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

export const createGatekeeprBetterAuth = ({
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
		checkContext: (ctx, options = {}) => {
			return checkBetterAuthContext(ctx, {
				client: resolvedClient,
				...defaults,
				...options
			})
		},
		handler(ctx) {
			return betterAuthGatekeeprHook(ctx, {
				client: resolvedClient,
				...defaults
			})
		},
		plugin(options = {}) {
			return createGatekeeprBetterAuthPlugin({
				client: resolvedClient,
				...defaults,
				...options
			})
		}
	}
}

export const createGatekeeprBetterAuthPlugin = ({
	id = "gatekeepr",
	matchPaths = DEFAULT_MATCH_PATHS,
	matcher,
	createAuthMiddleware,
	...options
} = {}) => {
	const handler = (ctx) => betterAuthGatekeeprHook(ctx, options)

	return {
		id,
		hooks: {
			before: [{
				matcher: matcher || createPathMatcher(matchPaths),
				handler: createAuthMiddleware ? createAuthMiddleware(handler) : handler
			}]
		}
	}
}

export const createPathMatcher = (paths = DEFAULT_MATCH_PATHS) => {
	const pathSet = new Set(paths)
	return (context) => pathSet.has(context?.path)
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

export const getContextHeaders = (ctx, headers) => {
	return headers || ctx?.headers || ctx?.request?.headers
}

export const getClientIp = (headers) => {
	for(const header of IP_HEADERS) {
		const value = getHeaderValue(headers, header)
		const ip = parseForwardedIp(value, header)
		if(ip) return ip
	}

	return undefined
}

export const getContextUserAgent = (ctx, headers) => {
	return getHeaderValue(getContextHeaders(ctx, headers), "user-agent")
}

export const betterAuthContextToGatekeeprPayload = async (ctx = {}, {
	email,
	ip,
	userAgent,
	headers,
	getEmail,
	getIp,
	getUserAgent
} = {}) => {
	const resolvedHeaders = getContextHeaders(ctx, headers)

	return cleanGatekeeprPayload({
		email: email || await resolveBetterAuthEmail(ctx, getEmail),
		ip: ip || (getIp ? await getIp(ctx, resolvedHeaders) : getClientIp(resolvedHeaders)),
		user_agent: userAgent || (getUserAgent ? await getUserAgent(ctx, resolvedHeaders) : getContextUserAgent(ctx, resolvedHeaders))
	})
}

export const checkBetterAuthContext = async (ctx = {}, {
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
	const payload = await betterAuthContextToGatekeeprPayload(ctx, payloadOptions)

	if(!payload.email) {
		if(missingEmail === "block") {
			const message = typeof blockMessage === "function" ? blockMessage({ status: "missing_email" }, ctx) : blockMessage

			return createBetterAuthDecision({
				allowed: false,
				status: "missing_email",
				payload,
				message,
				httpCode: blockHttpCode,
				includeGatekeeprResult
			})
		}

		return createBetterAuthDecision({
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
	const message = typeof blockMessage === "function" ? blockMessage(gatekeepr, ctx) : blockMessage

	return createBetterAuthDecision({
		allowed: !shouldReject,
		status: gatekeepr.status,
		gatekeepr,
		payload,
		message,
		httpCode: blockHttpCode,
		includeGatekeeprResult
	})
}

export const betterAuthGatekeeprHook = async (ctx, options = {}) => {
	const decision = await checkBetterAuthContext(ctx, options)
	if(decision.allowed) return { context: ctx }

	return {
		response: decision.response
	}
}

export const createBetterAuthDecision = ({
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

const resolveBetterAuthEmail = async (ctx, getEmail) => {
	if(getEmail) return getEmail(ctx)

	const body = ctx?.body || ctx?.request?.body
	return body?.email ||
		ctx?.email ||
		ctx?.user?.email ||
		ctx?.context?.body?.email ||
		ctx?.context?.newSession?.user?.email ||
		ctx?.context?.returned?.user?.email
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
