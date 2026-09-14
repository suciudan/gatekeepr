export const DEFAULT_GATEKEEPR_URL: "https://api.gatekeepr.io"
export const DEFAULT_REJECT_STATUSES: ["block"]

export type GatekeeprStatus = "allow" | "challenge" | "block" | string

export type GatekeeprPayload = {
	email?: string
	ip?: string
	user_agent?: string
	userAgent?: string
}

export type GatekeeprResult = {
	status: GatekeeprStatus
	threats?: string[]
	trust?: string[]
	blocklists?: string[]
	info?: Record<string, unknown>
	[key: string]: unknown
}

export type GatekeeprClient = {
	check(payload: GatekeeprPayload, requestOptions?: { headers?: Record<string, string>, signal?: AbortSignal }): Promise<GatekeeprResult>
}

export type SupabaseAuthHookEvent = {
	metadata?: {
		ip_address?: string
		ip?: string
		user_agent?: string
		headers?: Headers | Record<string, string | string[]>
		[key: string]: unknown
	}
	request?: {
		ip?: string
		headers?: Headers | Record<string, string | string[]>
		[key: string]: unknown
	}
	user?: {
		email?: string
		user_metadata?: {
			user_agent?: string
			[key: string]: unknown
		}
		[key: string]: unknown
	}
	email?: string
	ip?: string
	user_agent?: string
	[key: string]: unknown
}

export type SupabaseDecision = {
	allowed: boolean
	status: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	supabase: {
		status: number
		body: Record<string, unknown>
	}
}

export type EvaluateSupabaseAuthEventOptions = {
	client?: GatekeeprClient
	gatekeeprApiKey?: string
	gatekeeprBaseUrl?: string
	fetcher?: typeof fetch
	timeoutMs?: number
	rejectStatuses?: string[]
	missingEmail?: "allow" | "block"
	blockMessage?: string | ((gatekeepr: GatekeeprResult, event: SupabaseAuthHookEvent) => string)
	blockHttpCode?: number
	getEmail?: (event: SupabaseAuthHookEvent) => string | undefined
	getIp?: (event: SupabaseAuthHookEvent) => string | undefined
	getUserAgent?: (event: SupabaseAuthHookEvent) => string | undefined
	hookSecret?: string
	webhook?: {
		verify(payload: string, headers: Record<string, string>): SupabaseAuthHookEvent
	}
}

export class GatekeeprApiError extends Error {
	status?: number
	body?: unknown
	constructor(message: string, options?: { status?: number, body?: unknown })
}

export function normalizeSupabaseHookSecret(secret?: string): string | undefined
export function jsonResponse(body: unknown, status?: number): Response
export function createGatekeeprClient(options?: {
	apiKey: string
	baseUrl?: string
	fetcher?: typeof fetch
	timeoutMs?: number
}): GatekeeprClient
export function cleanGatekeeprPayload(payload?: GatekeeprPayload): GatekeeprPayload
export function getHeaderValue(headers: Headers | Record<string, string | string[]> | undefined, name: string): string | undefined
export function supabaseAuthEventToGatekeeprPayload(event: SupabaseAuthHookEvent, options?: Pick<EvaluateSupabaseAuthEventOptions, "getEmail" | "getIp" | "getUserAgent">): GatekeeprPayload
export function evaluateSupabaseAuthEvent(event: SupabaseAuthHookEvent, options?: EvaluateSupabaseAuthEventOptions): Promise<SupabaseDecision>
export function createSupabaseDecision(options: {
	allowed: boolean
	status: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	message?: string
	httpCode?: number
}): SupabaseDecision
export function toSupabaseAuthHookResponse(decision: SupabaseDecision): Response
export function createBeforeUserCreatedHook(options?: EvaluateSupabaseAuthEventOptions): (req: Request) => Promise<Response>
export function parseSupabaseAuthHookRequest(req: Request, options?: Pick<EvaluateSupabaseAuthEventOptions, "hookSecret" | "webhook">): Promise<SupabaseAuthHookEvent>
