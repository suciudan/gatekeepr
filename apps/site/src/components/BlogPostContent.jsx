"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import { useMemo, useState } from "react"

const codeBlockPattern = /<pre(?:\s[^>]*)?>\s*<code(?:\s[^>]*)?>([\s\S]*?)<\/code>\s*<\/pre>/gi

function normalizeCodeOnlyParagraphs(content) {
	return String(content || "").replace(/<p(?:\s[^>]*)?>((?:(?:\s|&nbsp;|<br\s*\/?>|<code(?:\s[^>]*)?>[\s\S]*?<\/code>)+))<\/p>/gi, (match, innerHtml) => {
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

function splitContent(content) {
	const normalizedContent = normalizeCodeOnlyParagraphs(content)
	const blocks = []
	let lastIndex = 0
	let match

	codeBlockPattern.lastIndex = 0

	while((match = codeBlockPattern.exec(normalizedContent)) !== null) {
		if(match.index > lastIndex) {
			blocks.push({
				html: normalizedContent.slice(lastIndex, match.index),
				type: "html",
			})
		}

		blocks.push({
			codeHtml: match[1],
			type: "code",
		})

		lastIndex = codeBlockPattern.lastIndex
	}

	if(lastIndex < normalizedContent.length) {
		blocks.push({
			html: normalizedContent.slice(lastIndex),
			type: "html",
		})
	}

	return blocks
}

function decodeHtml(value) {
	const textarea = document.createElement("textarea")
	textarea.innerHTML = value
	return textarea.value
}

function BlogCodeBlock({ codeHtml, index }) {
	const [copied, setCopied] = useState(false)

	const onCopy = async () => {
		await navigator.clipboard.writeText(decodeHtml(codeHtml))
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<figure className="blog-code-block">
			<button
				type="button"
				onClick={onCopy}
				aria-label={copied ? "Copied code block" : "Copy code block"}
				className="blog-code-copy-button"
			>
				{copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
				<span>{copied ? "Copied" : "Copy"}</span>
			</button>
			<pre>
				<code dangerouslySetInnerHTML={{__html: codeHtml}} />
			</pre>
			<span className="sr-only">{`Code block ${index + 1}`}</span>
		</figure>
	)
}

export default function BlogPostContent({ content }) {
	const blocks = useMemo(() => splitContent(content), [content])

	return (
		<div className="blog-post max-w-none text-gray-400">
			{blocks.map((block, index) => {
				if(block.type === "code") {
					return <BlogCodeBlock key={`code-${index}`} codeHtml={block.codeHtml} index={index} />
				}

				return (
					<div
						key={`html-${index}`}
						className="blog-html-chunk"
						dangerouslySetInnerHTML={{__html: block.html}}
					/>
				)
			})}
		</div>
	)
}
