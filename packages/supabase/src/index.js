export const DEFAULT_GATEKEEPR_URL = "https://api.gatekeepr.io"
export const DEFAULT_REJECT_STATUSES = ["block"]

export class GatekeeprApiError extends Error {
	constructor(message, { status, body } = {}) {
		super(message)
		this.name = "GatekeeprApiError"
		this.status = status
		this.body = body
	}
}

export const normalizeSupabaseHookSecret = (secret) => {
	if(!secret) return secret
	return String(secret).replace(/^v1,whsec_/, "")
}

export const jsonResponse = (body, status = 200) => {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json"
		}
	})
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

export const supabaseAuthEventToGatekeeprPayload = (event, {
	getEmail = defaultGetEmail,
	getIp = defaultGetIp,
	getUserAgent = defaultGetUserAgent
} = {}) => {
	return cleanGatekeeprPayload({
		email: getEmail(event),
		ip: getIp(event),
		user_agent: getUserAgent(event)
	})
}

export const evaluateSupabaseAuthEvent = async (event, {
	client,
	gatekeeprApiKey,
	gatekeeprBaseUrl,
	fetcher,
	timeoutMs,
	rejectStatuses = DEFAULT_REJECT_STATUSES,
	missingEmail = "allow",
	blockMessage = "Signup blocked by Gatekeepr.",
	blockHttpCode = 403,
	getEmail,
	getIp,
	getUserAgent
} = {}) => {
	const payload = supabaseAuthEventToGatekeeprPayload(event, {
		getEmail,
		getIp,
		getUserAgent
	})

	if(!payload.email) {
		if(missingEmail === "block") {
			return createSupabaseDecision({
				allowed: false,
				status: "missing_email",
				message: blockMessage,
				httpCode: blockHttpCode
			})
		}

		return createSupabaseDecision({
			allowed: true,
			status: "missing_email"
		})
	}

	const gatekeepr = await (client || createGatekeeprClient({
		apiKey: gatekeeprApiKey,
		baseUrl: gatekeeprBaseUrl,
		fetcher,
		timeoutMs
	})).check(payload)

	const shouldReject = rejectStatuses.includes(gatekeepr.status)
	const message = typeof blockMessage === "function" ? blockMessage(gatekeepr, event) : blockMessage

	return createSupabaseDecision({
		allowed: !shouldReject,
		status: gatekeepr.status,
		gatekeepr,
		message,
		httpCode: blockHttpCode
	})
}

export const createSupabaseDecision = ({
	allowed,
	status,
	gatekeepr,
	message,
	httpCode = 403
}) => {
	if(allowed) {
		return {
			allowed: true,
			status,
			gatekeepr,
			supabase: {
				status: 200,
				body: {}
			}
		}
	}

	return {
		allowed: false,
		status,
		gatekeepr,
		supabase: {
			status: httpCode,
			body: {
				error: {
					http_code: httpCode,
					message
				}
			}
		}
	}
}

export const toSupabaseAuthHookResponse = (decision) => {
	return jsonResponse(decision.supabase.body, decision.supabase.status)
}

export const createBeforeUserCreatedHook = (options = {}) => {
	return async function beforeUserCreatedHook(req) {
		if(req.method && req.method !== "POST") {
			return jsonResponse({
				error: {
					http_code: 405,
					message: "Method not allowed."
				}
			}, 405)
		}

		try {
			const event = await parseSupabaseAuthHookRequest(req, options)
			const decision = await evaluateSupabaseAuthEvent(event, options)
			return toSupabaseAuthHookResponse(decision)
		} catch(err) {
			const status = err.status || 500

			return jsonResponse({
				error: {
					http_code: status,
					message: err.message || "Supabase Auth hook failed."
				}
			}, status)
		}
	}
}

export const parseSupabaseAuthHookRequest = async (req, {
	hookSecret,
	webhook
} = {}) => {
	const payload = await req.text()

	if(hookSecret || webhook) {
		const wh = webhook || await createWebhookVerifier(hookSecret)
		return wh.verify(payload, Object.fromEntries(req.headers || []))
	}

	return JSON.parse(payload)
}

const createWebhookVerifier = async (hookSecret) => {
	const { Webhook } = await import("standardwebhooks")
	return new Webhook(normalizeSupabaseHookSecret(hookSecret))
}

const defaultGetEmail = (event) => {
	return event?.user?.email || event?.email
}

const defaultGetIp = (event) => {
	return event?.metadata?.ip_address ||
		event?.metadata?.ip ||
		event?.request?.ip ||
		event?.ip
}

const defaultGetUserAgent = (event) => {
	return event?.metadata?.user_agent ||
		getHeaderValue(event?.metadata?.headers, "user-agent") ||
		getHeaderValue(event?.request?.headers, "user-agent") ||
		event?.user?.user_metadata?.user_agent ||
		event?.user_agent
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
