export const DEFAULT_GATEKEEPR_URL: "https://api.gatekeepr.io"
export const DEFAULT_REJECT_STATUSES: ["block"]
export const DEFAULT_EMAIL_FIELDS: ["email", "username", "user.email"]
export const DEFAULT_EMAIL_SOURCES: ["body", "query", "params", "user", "request"]
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

export type HeaderSource = Headers | Record<string, string | string[] | undefined>

export type PassportRequest = {
	body?: Record<string, unknown>
	query?: Record<string, unknown>
	params?: Record<string, unknown>
	user?: Record<string, unknown>
	email?: string
	headers?: HeaderSource
	ip?: string
	ips?: string[]
	socket?: {
		remoteAddress?: string
		[key: string]: unknown
	}
	connection?: {
		remoteAddress?: string
		[key: string]: unknown
	}
	[key: string]: unknown
}

export type PassportResponse = {
	headersSent?: boolean
	statusCode?: number
	status?: (code: number) => PassportResponse
	json?: (body: Record<string, unknown>) => unknown
	setHeader?: (name: string, value: string) => unknown
	end?: (body?: string) => unknown
	[key: string]: unknown
}

export type PassportNext = (err?: unknown) => unknown

export type PassportPayloadOptions = {
	email?: string
	ip?: string
	userAgent?: string
	headers?: HeaderSource
	emailFields?: string | string[]
	emailSources?: string | string[]
	getEmail?: (req: PassportRequest) => string | undefined | null | Promise<string | undefined | null>
	getIp?: (req: PassportRequest, headers?: HeaderSource) => string | undefined | Promise<string | undefined>
	getUserAgent?: (req: PassportRequest, headers?: HeaderSource) => string | undefined | Promise<string | undefined>
}

export type CheckPassportRequestOptions = PassportPayloadOptions & {
	client?: GatekeeprClient
	gatekeeprApiKey?: string
	gatekeeprBaseUrl?: string
	fetcher?: typeof fetch
	timeoutMs?: number
	rejectStatuses?: string[]
	missingEmail?: "allow" | "block"
	blockMessage?: string | ((gatekeepr: GatekeeprResult, req: PassportRequest) => string)
	blockHttpCode?: number
	includeGatekeeprResult?: boolean
}

export type PassportBlockedResponse = {
	status: number
	body: Record<string, unknown>
}

export type PassportDecision = {
	allowed: boolean
	status: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	payload?: GatekeeprPayload
	response?: PassportBlockedResponse
}

export type PassportMiddlewareOptions = CheckPassportRequestOptions & {
	onReject?: (decision: PassportDecision, req: PassportRequest, res: PassportResponse, next?: PassportNext) => unknown
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
export function createGatekeeprPassport(options?: CheckPassportRequestOptions & {
	apiKey?: string
	baseUrl?: string
}): {
	client: GatekeeprClient
	checkRequest(req: PassportRequest, options?: CheckPassportRequestOptions): Promise<PassportDecision>
	middleware(options?: PassportMiddlewareOptions): (req: PassportRequest, res: PassportResponse, next?: PassportNext) => Promise<unknown>
}
export function cleanGatekeeprPayload(payload?: GatekeeprPayload): GatekeeprPayload
export function getHeaderValue(headers: HeaderSource | undefined, name: string): string | undefined
export function getRequestHeaders(req?: PassportRequest, headers?: HeaderSource): HeaderSource | undefined
export function getClientIp(headers: HeaderSource | undefined): string | undefined
export function getRequestIp(req?: PassportRequest, headers?: HeaderSource): string | undefined
export function getRequestUserAgent(req?: PassportRequest, headers?: HeaderSource): string | undefined
export function getRequestFieldValue(req?: PassportRequest, fields?: string | string[], sources?: string | string[]): unknown
export function passportRequestToGatekeeprPayload(req?: PassportRequest, options?: PassportPayloadOptions): Promise<GatekeeprPayload>
export function checkPassportRequest(req?: PassportRequest, options?: CheckPassportRequestOptions): Promise<PassportDecision>
export function createGatekeeprPassportMiddleware(options?: PassportMiddlewareOptions): (req: PassportRequest, res: PassportResponse, next?: PassportNext) => Promise<unknown>
export const gatekeeprPassportMiddleware: typeof createGatekeeprPassportMiddleware
export function createPassportDecision(options: {
	allowed: boolean
	status: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	payload?: GatekeeprPayload
	message?: string
	httpCode?: number
	includeGatekeeprResult?: boolean
}): PassportDecision
export function createBlockedBody(options?: {
	status?: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	message?: string
	includeGatekeeprResult?: boolean
}): Record<string, unknown>
export function sendPassportBlockedResponse(res: PassportResponse | undefined, decision: PassportDecision): unknown
export function parseForwardedIp(value?: string, headerName?: string): string | undefined
