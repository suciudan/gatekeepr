import { getBlogCategories, getPosts } from "@/libs/blog"
import { getDisposableProviderDirectory } from "@/libs/disposable-providers"

export const dynamic = "force-dynamic"

const appUrl = "https://gatekeepr.io"

const staticRoutes = [
	{
		path: "/",
		changeFrequency: "weekly",
		priority: 1,
	},
	{
		path: "/disposable-email-checker",
		changeFrequency: "weekly",
		priority: 0.9,
	},
	{
		path: "/disposable-email-data",
		changeFrequency: "weekly",
		priority: 0.8,
	},
	{
		path: "/integrations",
		changeFrequency: "weekly",
		priority: 0.8,
	},
	{
		path: "/get-free-api-key",
		changeFrequency: "monthly",
		priority: 0.8,
	},
	{
		path: "/privacy",
		changeFrequency: "monthly",
		priority: 0.5,
	},
	{
		path: "/status",
		changeFrequency: "daily",
		priority: 0.6,
	},
	{
		path: "/legal/data-processing-agreement",
		changeFrequency: "monthly",
		priority: 0.5,
	},
	{
		path: "/legal/terms-of-service",
		changeFrequency: "monthly",
		priority: 0.5,
	},
]

function createUrl(path) {
	return new URL(path, appUrl).toString()
}

function createPath(basePath, slug) {
	return `${basePath}/${encodeURIComponent(slug)}`
}

function toLastModified(value, fallback) {
	if(!value) return fallback
	const date = new Date(value)
	if(Number.isNaN(date.getTime())) return fallback
	return date
}

async function getSitemapData(label, loader) {
	try {
		return {
			available: true,
			entries: await loader(),
		}
	} catch(error) {
		console.warn(`Skipping ${label} sitemap entries: ${error?.message || error}`)
		return {
			available: false,
			entries: [],
		}
	}
}

function createEntry({ path, lastModified, changeFrequency, priority }) {
	return {
		url: createUrl(path),
		lastModified,
		changeFrequency,
		priority,
	}
}

export default async function sitemap() {
	const generatedAt = new Date()
	const [postData, categoryData, providerData] = await Promise.all([
		getSitemapData("blog post", getPosts),
		getSitemapData("blog category", getBlogCategories),
		getSitemapData("disposable provider", getDisposableProviderDirectory),
	])
	const posts = postData.entries
	const categories = categoryData.entries
	const providers = providerData.entries

	const links = staticRoutes.map(route => createEntry({
		...route,
		lastModified: generatedAt,
	}))

	if(postData.available && categoryData.available) {
		links.push(createEntry({
			path: "/blog",
			lastModified: generatedAt,
			changeFrequency: "weekly",
			priority: 0.9,
		}))
	}

	for(let i = 0; i < posts.length; i++) {
		const post = posts[i]
		if(!post.slug) continue
		links.push({
			url: createUrl(createPath("/blog", post.slug)),
			lastModified: toLastModified(post.updatedAt || post.datetime, generatedAt),
			changeFrequency: "weekly",
			priority: 0.9,
		})
	}

	for(let i = 0; i < categories.length; i++) {
		const category = categories[i]
		if(!category.slug) continue
		links.push({
			url: createUrl(createPath("/blog/category", category.slug)),
			changeFrequency: "weekly",
			lastModified: generatedAt,
			priority: 0.8,
		})
	}

	for(let i = 0; i < providers.length; i++) {
		const provider = providers[i]
		const providerPathSlug = provider.pathSlug || provider.slug
		if(!providerPathSlug) continue
		links.push({
			url: createUrl(createPath("/disposable-email-data", providerPathSlug)),
			lastModified: toLastModified(provider.lastSeenAt || provider.lastEnrichedAt, generatedAt),
			changeFrequency: "weekly",
			priority: 0.6,
		})
	}

	return links
}
