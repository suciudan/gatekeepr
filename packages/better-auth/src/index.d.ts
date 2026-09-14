export const DEFAULT_GATEKEEPR_URL: "https://api.gatekeepr.io"
export const DEFAULT_REJECT_STATUSES: ["block"]
export const DEFAULT_MATCH_PATHS: ["/sign-up/email", "/sign-in/email"]
export const IP_HEADERS: string[]

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

export type HeaderSource = Headers | Record<string, string | string[]>

export type BetterAuthContext = {
	path?: string
	body?: Record<string, unknown>
	request?: {
		headers?: HeaderSource
		body?: Record<string, unknown>
		[key: string]: unknown
	}
	headers?: HeaderSource
	email?: string
	user?: {
		email?: string
		[key: string]: unknown
	}
	context?: {
		body?: Record<string, unknown>
		newSession?: {
			user?: {
				email?: string
				[key: string]: unknown
			}
			[key: string]: unknown
		}
		returned?: {
			user?: {
				email?: string
				[key: string]: unknown
			}
			[key: string]: unknown
		}
		[key: string]: unknown
	}
	[key: string]: unknown
}

export type BetterAuthPayloadOptions = {
	email?: string
	ip?: string
	userAgent?: string
	headers?: HeaderSource
	getEmail?: (ctx: BetterAuthContext) => string | undefined | Promise<string | undefined>
	getIp?: (ctx: BetterAuthContext, headers?: HeaderSource) => string | undefined | Promise<string | undefined>
	getUserAgent?: (ctx: BetterAuthContext, headers?: HeaderSource) => string | undefined | Promise<string | undefined>
}

export type CheckBetterAuthContextOptions = BetterAuthPayloadOptions & {
	client?: GatekeeprClient
	gatekeeprApiKey?: string
	gatekeeprBaseUrl?: string
	fetcher?: typeof fetch
	timeoutMs?: number
	rejectStatuses?: string[]
	missingEmail?: "allow" | "block"
	blockMessage?: string | ((gatekeepr: GatekeeprResult, ctx: BetterAuthContext) => string)
	blockHttpCode?: number
	includeGatekeeprResult?: boolean
}

export type BetterAuthDecision = {
	allowed: boolean
	status: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	payload?: GatekeeprPayload
	response?: Response
}

export type BetterAuthPlugin = {
	id: string
	hooks: {
		before: Array<{
			matcher: (context: BetterAuthContext) => boolean
			handler: (ctx: BetterAuthContext) => Promise<{ context?: BetterAuthContext, response?: Response }>
		}>
	}
}

export class GatekeeprApiError extends Error {
	status?: number
	body?: unknown
	constructor(message: string, options?: { status?: number, body?: unknown })
}

export function createGatekeeprClient(options?: {
	apiKey: string
	baseUrl?: string
	fetcher?: typeof fetch
	timeoutMs?: number
}): GatekeeprClient
export function createGatekeeprBetterAuth(options?: CheckBetterAuthContextOptions & {
	apiKey?: string
	baseUrl?: string
}): {
	client: GatekeeprClient
	checkContext(ctx: BetterAuthContext, options?: CheckBetterAuthContextOptions): Promise<BetterAuthDecision>
	handler(ctx: BetterAuthContext): Promise<{ context?: BetterAuthContext, response?: Response }>
	plugin(options?: CreateGatekeeprBetterAuthPluginOptions): BetterAuthPlugin
}
export type CreateGatekeeprBetterAuthPluginOptions = CheckBetterAuthContextOptions & {
	id?: string
	matchPaths?: string[]
	matcher?: (context: BetterAuthContext) => boolean
	createAuthMiddleware?: <Handler extends (ctx: BetterAuthContext) => Promise<{ context?: BetterAuthContext, response?: Response }>>(handler: Handler) => Handler
}
export function createGatekeeprBetterAuthPlugin(options?: CreateGatekeeprBetterAuthPluginOptions): BetterAuthPlugin
export function createPathMatcher(paths?: string[]): (context: BetterAuthContext) => boolean
export function cleanGatekeeprPayload(payload?: GatekeeprPayload): GatekeeprPayload
export function getHeaderValue(headers: HeaderSource | undefined, name: string): string | undefined
export function getContextHeaders(ctx?: BetterAuthContext, headers?: HeaderSource): HeaderSource | undefined
export function getClientIp(headers: HeaderSource | undefined): string | undefined
export function getContextUserAgent(ctx?: BetterAuthContext, headers?: HeaderSource): string | undefined
export function betterAuthContextToGatekeeprPayload(ctx?: BetterAuthContext, options?: BetterAuthPayloadOptions): Promise<GatekeeprPayload>
export function checkBetterAuthContext(ctx?: BetterAuthContext, options?: CheckBetterAuthContextOptions): Promise<BetterAuthDecision>
export function betterAuthGatekeeprHook(ctx: BetterAuthContext, options?: CheckBetterAuthContextOptions): Promise<{ context?: BetterAuthContext, response?: Response }>
export function createBetterAuthDecision(options: {
	allowed: boolean
	status: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	payload?: GatekeeprPayload
	message?: string
	httpCode?: number
	includeGatekeeprResult?: boolean
}): BetterAuthDecision
export function createBlockedResponse(options?: {
	status?: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	message?: string
	httpCode?: number
	includeGatekeeprResult?: boolean
}): Response
export function parseForwardedIp(value?: string, headerName?: string): string | undefined
