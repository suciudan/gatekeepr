function getPayloadCmsImagePattern() {
	const cmsUrl = process.env.PAYLOAD_CMS_URL || process.env.CMS_URL || process.env.NEXT_PUBLIC_PAYLOAD_CMS_URL || "https://dash.gatekeepr.io"

	try {
		const url = new URL(cmsUrl)

		return {
			hostname: url.hostname,
			pathname: "/api/media/file/**",
			port: url.port,
			protocol: url.protocol.replace(":", ""),
		}
	} catch {
		return {
			hostname: "dash.gatekeepr.io",
			pathname: "/api/media/file/**",
			protocol: "https",
		}
	}
}

/** @type {import('next').NextConfig} */
const nextConfig = {
	images: {
		remotePatterns: [
			getPayloadCmsImagePattern(),
			{
				hostname: "dash.gatekeepr.io",
				pathname: "/api/media/file/**",
				protocol: "https",
			},
			{
				hostname: "localhost",
				pathname: "/api/media/file/**",
				port: "4000",
				protocol: "http",
			},
		],
	},
	serverExternalPackages: ["knex"],
	async headers() {
		const disposableEmailDataCacheHeaders = [
			{
				key: "Cache-Control",
				value: "public, s-maxage=3600, stale-while-revalidate=86400",
			},
			{
				key: "CDN-Cache-Control",
				value: "public, s-maxage=3600, stale-while-revalidate=86400",
			},
			{
				key: "Cloudflare-CDN-Cache-Control",
				value: "public, max-age=3600, stale-while-revalidate=86400",
			},
		]

		return [
			{
				source: "/disposable-email-data",
				headers: disposableEmailDataCacheHeaders,
			},
			{
				source: "/disposable-email-data/:slug",
				headers: disposableEmailDataCacheHeaders,
			},
		]
	},
	async redirects() {
		return [
			{
				source: "/research",
				destination: "/blog/category/research",
				permanent: true,
			},
			{
				source: "/research/detect-disposable-email-addresses-mx-records",
				destination: "/blog/detect-disposable-email-addresses-mx-records",
				permanent: true,
			},
			{
				source: "/blog/category/how-to",
				destination: "/blog/category/guides",
				permanent: true,
			},
			{
				source: "/provider/:slug",
				destination: "/disposable-email-data/:slug",
				permanent: true,
			},
			{
				source: "/connect",
				destination: "/get-free-api-key",
				permanent: true,
			},
		]
	},
}

export default nextConfig
