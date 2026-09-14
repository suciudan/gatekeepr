import { injectHeadingIds } from "@/libs/markdownToc"

const DEFAULT_PAYLOAD_CMS_URL = "https://dash.gatekeepr.io"
const CATEGORY_SLUG_ALIASES = {
	"how-to": "guides",
}
const CATEGORY_NAME_OVERRIDES = {
	guides: "Guides",
}

function getPayloadCmsUrl() {
	return (
		process.env.PAYLOAD_CMS_URL ||
		process.env.CMS_URL ||
		process.env.NEXT_PUBLIC_PAYLOAD_CMS_URL ||
		DEFAULT_PAYLOAD_CMS_URL
	).replace(/\/+$/, "")
}

function addParams(url, params) {
	for(const [key, value] of Object.entries(params)) {
		if(value === undefined || value === null) continue
		url.searchParams.set(key, String(value))
	}
}

function resolvePayloadCmsUrl(value) {
	if(!value) return ""
	const normalizedValue = String(value).trim()
	if(!normalizedValue) return ""

	if(/^https?:\/\//i.test(normalizedValue)) {
		return normalizedValue
	}

	if(normalizedValue.startsWith("/")) {
		return `${getPayloadCmsUrl()}${normalizedValue}`
	}

	return normalizedValue
}

async function payloadFetch(collection, params = {}) {
	const url = new URL(`/api/${collection}`, getPayloadCmsUrl())
	addParams(url, params)

	const response = await fetch(url, {
		cache: "no-store",
	})

	if(!response.ok) {
		throw new Error(`Payload request failed: ${response.status} ${url.pathname}`)
	}

	return response.json()
}

function formatDate(value) {
	if(!value) return ""

	return new Intl.DateTimeFormat("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	}).format(new Date(value))
}

function stripHtml(value) {
	return String(value || "")
		.replace(/<[^>]*>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim()
}

function createHeadingId(value, slugCounts) {
	const baseId = stripHtml(value)
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-") || "section"
	const duplicateCount = slugCounts.get(baseId) || 0
	slugCounts.set(baseId, duplicateCount + 1)

	if(duplicateCount === 0) return baseId
	return `${baseId}-${duplicateCount + 1}`
}

function extractTableOfContentsFromHtml(contentHtml, levels = [2]) {
	const slugCounts = new Map()
	const entries = []
	const headingPattern = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g
	let match

	while((match = headingPattern.exec(contentHtml || "")) !== null) {
		const level = Number(match[1])
		if(!levels.includes(level)) continue

		const title = stripHtml(match[2])
		if(!title) continue

		entries.push({
			id: createHeadingId(title, slugCounts),
			level,
			title,
		})
	}

	return entries
}

function normalizeCodeOnlyParagraphs(contentHtml) {
	return String(contentHtml || "").replace(/<p(?:\s[^>]*)?>((?:(?:\s|&nbsp;|<br\s*\/?>|<code(?:\s[^>]*)?>[\s\S]*?<\/code>)+))<\/p>/gi, (match, innerHtml) => {
		const nonCodeHtml = innerHtml
			.replace(/<code(?:\s[^>]*)?>[\s\S]*?<\/code>/gi, "")
			.replace(/<br\s*\/?>/gi, "")
			.replace(/&nbsp;/gi, "")
			.trim()

		if(nonCodeHtml) return match

		const codeHtml = innerHtml
			.replace(/<code(?:\s[^>]*)?>([\s\S]*?)<\/code>|<br\s*\/?>|&nbsp;/gi, (token, code) => {
				if(/^<br/i.test(token)) return "\n"
				if(/^&nbsp;/i.test(token)) return ""
				return code
			})
			.replace(/^\n+|\n+$/g, "")

		if(!codeHtml.trim()) return match

		return `<pre><code>${codeHtml}</code></pre>`
	})
}

function normalizeCategory(category) {
	const slug = normalizeCategorySlug(category.slug)

	return {
		id: category.id,
		name: normalizeCategoryName(category.name, slug),
		slug,
	}
}

function normalizeCategories(categories) {
	const categoriesBySlug = new Map()

	for(const category of categories) {
		const normalizedCategory = normalizeCategory(category)
		if(!normalizedCategory.slug || categoriesBySlug.has(normalizedCategory.slug)) continue
		categoriesBySlug.set(normalizedCategory.slug, normalizedCategory)
	}

	return Array.from(categoriesBySlug.values()).sort((firstCategory, secondCategory) => {
		return firstCategory.name.localeCompare(secondCategory.name)
	})
}

function normalizeCategorySlug(categorySlug) {
	return CATEGORY_SLUG_ALIASES[categorySlug] || categorySlug
}

function normalizeCategoryName(categoryName, categorySlug) {
	return CATEGORY_NAME_OVERRIDES[categorySlug] || categoryName
}

function createDescription(post) {
	const bodyText = stripHtml(post.bodyText || post.bodyHtml || "")

	return post.seoDescription || post.excerpt || bodyText
}

function normalizePost(post) {
	const categorySlug = normalizeCategorySlug(post.categorySlug || post.categoryRef?.slug || "")
	const categoryName = normalizeCategoryName(post.category || post.categoryRef?.name || "", categorySlug)
	const publishedAt = post.publishedAt || post.firstPublishedAt || post.createdAt
	const slug = post.uid
	const heroImage = post.heroImage || post.heroImageMedia || {}

	return {
		id: post.id,
		category: categorySlug,
		categoryName,
		content: post.bodyHtml || "",
		date: formatDate(publishedAt),
		datetime: publishedAt,
		description: createDescription(post),
		imageAlt: heroImage.alt || "",
		imageHeight: heroImage.height || null,
		imageUrl: resolvePayloadCmsUrl(heroImage.url) || `${slug}.webp`,
		imageWidth: heroImage.width || null,
		seoDescription: post.seoDescription || post.excerpt || "",
		slug,
		title: post.title,
		updatedAt: post.updatedAt,
	}
}

const blogPostListSelect = {
	"select[category]": true,
	"select[categoryRef]": true,
	"select[categorySlug]": true,
	"select[createdAt]": true,
	"select[bodyText]": true,
	"select[excerpt]": true,
	"select[firstPublishedAt]": true,
	"select[heroImage]": true,
	"select[heroImageMedia]": true,
	"select[publishedAt]": true,
	"select[seoDescription]": true,
	"select[title]": true,
	"select[uid]": true,
	"select[updatedAt]": true,
}

const publishedPostWhere = {
	"where[_status][equals]": "published",
	"where[lang][equals]": "en",
}

export async function getPosts() {
	const result = await payloadFetch("blog-posts", {
		depth: 1,
		limit: 100,
		sort: "-publishedAt",
		...publishedPostWhere,
		...blogPostListSelect,
	})

	return (result.docs || []).map(normalizePost)
}

export async function getBlogCategories() {
	const result = await payloadFetch("categories", {
		depth: 0,
		limit: 100,
		sort: "name",
		"where[lang][equals]": "en",
		"select[name]": true,
		"select[slug]": true,
	})

	return normalizeCategories(result.docs || [])
}

export async function getPostsByCategory(categorySlug) {
	const normalizedCategorySlug = normalizeCategorySlug(categorySlug)
	const categorySlugWhere = normalizedCategorySlug === "guides" ? {
		"where[or][0][categorySlug][equals]": "guides",
		"where[or][1][categorySlug][equals]": "how-to",
	} : {
		"where[categorySlug][equals]": normalizedCategorySlug,
	}

	const result = await payloadFetch("blog-posts", {
		depth: 1,
		limit: 100,
		sort: "-publishedAt",
		...publishedPostWhere,
		...categorySlugWhere,
		...blogPostListSelect,
	})

	return (result.docs || []).map(normalizePost)
}

export async function getPost(slug) {
	const result = await payloadFetch("blog-posts", {
		depth: 1,
		limit: 1,
		...publishedPostWhere,
		"where[uid][equals]": slug,
		...blogPostListSelect,
		"select[bodyHtml]": true,
	})
	const post = result.docs?.[0]
	if(!post) return null

	const normalizedPost = normalizePost(post)
	const tableOfContents = extractTableOfContentsFromHtml(normalizedPost.content, [2])
	const content = normalizeCodeOnlyParagraphs(injectHeadingIds(normalizedPost.content, tableOfContents))
		.replace(/<table/g, `<div class="table-wrapper"><table`)
		.replace(/<\/table>/g, `</table></div>`)

	return {
		...normalizedPost,
		content,
		tableOfContents,
	}
}
