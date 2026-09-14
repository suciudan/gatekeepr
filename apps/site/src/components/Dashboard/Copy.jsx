"use client"

import { ClipboardDocumentCheckIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import clsx from "clsx"

export default function Copy({ children }) {
	
	const [copied, setCopied] = useState(false)
	
	const onClick = async () => {
		await navigator.clipboard.writeText(children)
		setCopied(true)
		setTimeout(() => setCopied(false), 4000)
	}
	
	return (
		<div className="w-full max-w-md">
			<div className="relative">
				<label htmlFor="copy-text" className="sr-only">Copy</label>
				<input
					id="copy-text"
					type="text"
					className={clsx(
						"col-span-6 border-2 text-sm rounded-lg block w-full pr-2.5 pl-4 py-4",
						"bg-slate-950 border-slate-800 placeholder-gray-400 text-white",
						"focus:ring-blue-500 focus:border-blue-500"
					)}
					value={children}
					disabled={true}
					readOnly={true}
				/>
				<button
					className={clsx(
						"absolute end-2.5 top-1/2 -translate-y-1/2 rounded-lg py-2 px-2.5 border h-8",
						"inline-flex items-center justify-center cursor-pointer group transition-all",
						"text-blue-600 bg-slate-950 border-blue-600 hover:border-blue-500 hover:text-blue-500"
					)}
					onClick={onClick}
				>
					<span className={clsx("flex items-center gap-1.5")}>
						{copied ?
							<ClipboardDocumentCheckIcon className="size-4 text-blue-500" /> :
							<ClipboardDocumentListIcon className="size-4 transition-all" />
						}
						<span className="text-xs font-semibold transition-all hidden sm:inline">
							{copied ? "Copied" : "Copy"}
						</span>
					</span>
				</button>
			</div>
		</div>
	)
}