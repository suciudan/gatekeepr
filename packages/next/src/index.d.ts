export const DEFAULT_GATEKEEPR_URL: "https://api.gatekeepr.io"
export const DEFAULT_REJECT_STATUSES: ["block"]
export const DEFAULT_EMAIL_PATHS: ["email", "user.email"]
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

export type NextGatekeeprPayloadOptions = {
	email?: string
	ip?: string
	userAgent?: string
	headers?: HeaderSource
	getEmail?: (request?: Request) => string | undefined | Promise<string | undefined>
	getIp?: (request?: Request, headers?: HeaderSource) => string | undefined | Promise<string | undefined>
	getUserAgent?: (request?: Request, headers?: HeaderSource) => string | undefined | Promise<string | undefined>
	emailPaths?: string[]
}

export type CheckNextRequestOptions = NextGatekeeprPayloadOptions & {
	client?: GatekeeprClient
	gatekeeprApiKey?: string
	gatekeeprBaseUrl?: string
	fetcher?: typeof fetch
	timeoutMs?: number
	rejectStatuses?: string[]
	missingEmail?: "allow" | "block"
	blockMessage?: string | ((gatekeepr: GatekeeprResult, request?: Request) => string)
	blockHttpCode?: number
	includeGatekeeprResult?: boolean
}

export type NextGatekeeprDecision = {
	allowed: boolean
	status: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	payload?: GatekeeprPayload
	response?: Response
}

export type ProtectedRouteHandler<Context = unknown> = (
	request: Request,
	context: Context,
	decision: NextGatekeeprDecision
) => Response | Promise<Response>

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
export function createGatekeeprNext(options?: CheckNextRequestOptions & {
	apiKey?: string
	baseUrl?: string
	gatekeeprBaseUrl?: string
}): {
	client: GatekeeprClient
	checkRequest(request?: Request, options?: CheckNextRequestOptions): Promise<NextGatekeeprDecision>
	protectRoute<Context = unknown>(handler: ProtectedRouteHandler<Context>, options?: CheckNextRequestOptions): (request: Request, context: Context) => Promise<Response>
}
export function cleanGatekeeprPayload(payload?: GatekeeprPayload): GatekeeprPayload
export function getHeaderValue(headers: HeaderSource | undefined, name: string): string | undefined
export function getClientIp(headers: HeaderSource | undefined): string | undefined
export function getRequestHeaders(request?: Request, headers?: HeaderSource): HeaderSource | undefined
export function getRequestUserAgent(request?: Request, headers?: HeaderSource): string | undefined
export function buildNextGatekeeprPayload(request?: Request, options?: NextGatekeeprPayloadOptions): Promise<GatekeeprPayload>
export function checkNextRequest(request?: Request, options?: CheckNextRequestOptions): Promise<NextGatekeeprDecision>
export function createNextDecision(options: {
	allowed: boolean
	status: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	payload?: GatekeeprPayload
	message?: string
	httpCode?: number
	includeGatekeeprResult?: boolean
}): NextGatekeeprDecision
export function createBlockedResponse(options?: {
	status?: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	message?: string
	httpCode?: number
	includeGatekeeprResult?: boolean
}): Response
export function createProtectedRoute<Context = unknown>(handler: ProtectedRouteHandler<Context>, options?: CheckNextRequestOptions): (request: Request, context: Context) => Promise<Response>
export function parseForwardedIp(value?: string, headerName?: string): string | undefined
export function getValueAtPath(value: Record<string, unknown> | undefined, path: string): unknown
