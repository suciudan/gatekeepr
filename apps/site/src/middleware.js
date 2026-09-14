import { NextResponse } from "next/server"

export function middleware(request) {
	
	const requestHeaders = new Headers(request.headers)
	
	const ip =
		request.ip ??
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		request.headers.get("x-real-ip") ??
		""
	
	const userAgent = request.headers.get("user-agent") ?? ""
	
	requestHeaders.set("x-client-ip", ip)
	requestHeaders.set("x-client-ua", userAgent)
	
	return NextResponse.next({
		request: {
			headers: requestHeaders
		}
	})
	
}