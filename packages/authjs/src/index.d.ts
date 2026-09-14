export const DEFAULT_GATEKEEPR_URL: "https://api.gatekeepr.io"
export const DEFAULT_REJECT_STATUSES: ["block"]
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

export type AuthJsSignInParams = {
	user?: {
		email?: string | null
		[key: string]: unknown
	}
	profile?: {
		email?: string | null
		[key: string]: unknown
	}
	account?: {
		email?: string | null
		[key: string]: unknown
	} | null
	credentials?: Record<string, unknown>
	email?: {
		verificationRequest?: boolean
		[key: string]: unknown
	}
	[key: string]: unknown
}

export type AuthJsSignInResult = boolean | string

export type AuthJsPayloadOptions = {
	email?: string
	ip?: string
	userAgent?: string
	request?: Request
	headers?: HeaderSource
	getEmail?: (params: AuthJsSignInParams) => string | undefined | null | Promise<string | undefined | null>
	getIp?: (params: AuthJsSignInParams, request?: Request, headers?: HeaderSource) => string | undefined | Promise<string | undefined>
	getUserAgent?: (params: AuthJsSignInParams, request?: Request, headers?: HeaderSource) => string | undefined | Promise<string | undefined>
}

export type CheckAuthJsSignInOptions = AuthJsPayloadOptions & {
	client?: GatekeeprClient
	gatekeeprApiKey?: string
	gatekeeprBaseUrl?: string
	fetcher?: typeof fetch
	timeoutMs?: number
	rejectStatuses?: string[]
	missingEmail?: "allow" | "block"
	blockResult?: AuthJsSignInResult | ((gatekeepr: GatekeeprResult, params: AuthJsSignInParams) => AuthJsSignInResult)
}

export type AuthJsDecision = {
	allowed: boolean
	status: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	payload?: GatekeeprPayload
	result: AuthJsSignInResult
}

export type AuthJsCallbacks = {
	signIn?: (params: AuthJsSignInParams) => AuthJsSignInResult | Promise<AuthJsSignInResult>
	[key: string]: unknown
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
export function createGatekeeprAuth(options?: CheckAuthJsSignInOptions & {
	apiKey?: string
	baseUrl?: string
}): {
	client: GatekeeprClient
	checkSignIn(params: AuthJsSignInParams, options?: CheckAuthJsSignInOptions): Promise<AuthJsDecision>
	signIn(params: AuthJsSignInParams): Promise<AuthJsSignInResult>
	callbacks<T extends AuthJsCallbacks>(existingCallbacks?: T): T & {
		signIn: (params: AuthJsSignInParams) => Promise<AuthJsSignInResult>
	}
}
export function cleanGatekeeprPayload(payload?: GatekeeprPayload): GatekeeprPayload
export function getHeaderValue(headers: HeaderSource | undefined, name: string): string | undefined
export function getRequestHeaders(request?: Request, headers?: HeaderSource): HeaderSource | undefined
export function getClientIp(headers: HeaderSource | undefined): string | undefined
export function getRequestUserAgent(request?: Request, headers?: HeaderSource): string | undefined
export function authJsSignInToGatekeeprPayload(params?: AuthJsSignInParams, options?: AuthJsPayloadOptions): Promise<GatekeeprPayload>
export function checkAuthJsSignIn(params?: AuthJsSignInParams, options?: CheckAuthJsSignInOptions): Promise<AuthJsDecision>
export function authJsSignIn(params?: AuthJsSignInParams, options?: CheckAuthJsSignInOptions): Promise<AuthJsSignInResult>
export function createGatekeeprSignInCallback(options?: CheckAuthJsSignInOptions): (params: AuthJsSignInParams) => Promise<AuthJsSignInResult>
export function createGatekeeprCallbacks<T extends AuthJsCallbacks>(callbacks?: T, options?: CheckAuthJsSignInOptions): T & {
	signIn: (params: AuthJsSignInParams) => Promise<AuthJsSignInResult>
}
export function composeSignInCallbacks(...callbacks: Array<((params: AuthJsSignInParams) => AuthJsSignInResult | Promise<AuthJsSignInResult>) | undefined | null>): (params: AuthJsSignInParams) => Promise<AuthJsSignInResult>
export function createAuthJsDecision(options: {
	allowed: boolean
	status: GatekeeprStatus | "missing_email"
	gatekeepr?: GatekeeprResult
	payload?: GatekeeprPayload
	result?: AuthJsSignInResult
}): AuthJsDecision
export function parseForwardedIp(value?: string, headerName?: string): string | undefined
