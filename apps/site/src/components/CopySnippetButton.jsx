"use client"

import { ClipboardDocumentCheckIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import clsx from "clsx"

export default function CopySnippetButton({ value }) {
	const [copied, setCopied] = useState(false)

	const onClick = async () => {
		await navigator.clipboard.writeText(value)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={copied ? "Copied" : "Copy code snippet"}
			title={copied ? "Copied" : "Copy"}
			className={clsx(
				"inline-flex cursor-pointer items-center justify-center rounded-full border p-3",
				"border-blue-500/20 bg-blue-500/10 text-blue-300 transition-all",
				"hover:border-blue-400/30 hover:bg-blue-500/15 hover:text-blue-200"
			)}
		>
			{copied ? <ClipboardDocumentCheckIcon className="size-4" /> : <ClipboardDocumentListIcon className="size-4" />}
			<span className="sr-only">{copied ? "Copied" : "Copy"}</span>
		</button>
	)
}
