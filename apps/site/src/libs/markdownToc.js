function stripMarkdownSyntax(value) {
	return value
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/[*_~]/g, "")
		.replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1")
		.replace(/\s+#+\s*$/, "")
		.trim()
}

function createHeadingId(value, slugCounts) {
	const baseId = stripMarkdownSyntax(value)
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

export function extractTableOfContents(content, levels = [2]) {
	const slugCounts = new Map()

	return content
		.split(/\r?\n/)
		.reduce((entries, line) => {
			const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
			if(!match) return entries

			const level = match[1].length
			if(!levels.includes(level)) return entries

			const title = stripMarkdownSyntax(match[2])
			if(!title) return entries

			entries.push({
				id: createHeadingId(title, slugCounts),
				title,
				level,
			})

			return entries
		}, [])
}

export function injectHeadingIds(contentHtml, tableOfContents) {
	let entryIndex = 0

	return contentHtml.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (heading, level, innerHtml) => {
		const entry = tableOfContents[entryIndex]
		if(!entry || entry.level !== Number(level)) return heading

		entryIndex += 1
		return `<h${level} id="${entry.id}">${innerHtml}</h${level}>`
	})
}
