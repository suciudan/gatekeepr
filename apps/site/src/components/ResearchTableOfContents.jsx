"use client"

import clsx from "clsx"
import { useEffect, useState } from "react"

const HEADING_OFFSET = 156

export default function ResearchTableOfContents({ items }) {
	const [activeId, setActiveId] = useState(items[0]?.id || "")

	useEffect(() => {
		if(!items.length) return

		let frameId = 0

		const syncActiveId = () => {
			const headings = items
				.map((item) => ({
					item,
					element: document.getElementById(item.id),
				}))
				.filter((entry) => Boolean(entry.element))

			if(!headings.length) return

			let nextActiveId = headings[0].item.id

			for(const { item, element } of headings) {
				if(element.getBoundingClientRect().top <= HEADING_OFFSET) {
					nextActiveId = item.id
					continue
				}

				break
			}

			setActiveId((currentActiveId) => {
				if(currentActiveId === nextActiveId) return currentActiveId
				return nextActiveId
			})
		}

		const queueSync = () => {
			cancelAnimationFrame(frameId)
			frameId = window.requestAnimationFrame(() => {
				syncActiveId()
			})
		}

		const syncFromHash = () => {
			const hash = window.location.hash.replace(/^#/, "")
			if(hash && items.some((item) => item.id === hash)) {
				setActiveId(hash)
				queueSync()
				return
			}

			queueSync()
		}

		syncFromHash()
		window.addEventListener("scroll", queueSync, { passive: true })
		window.addEventListener("resize", queueSync)
		window.addEventListener("hashchange", syncFromHash)

		return () => {
			cancelAnimationFrame(frameId)
			window.removeEventListener("scroll", queueSync)
			window.removeEventListener("resize", queueSync)
			window.removeEventListener("hashchange", syncFromHash)
		}
	}, [items])

	return (
		<div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-5">
			<p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-400">
				On this page
			</p>
			<nav className="mt-4" aria-label="Table of contents">
				<ol className="space-y-1.5">
					{items.map((item) => {
						const isActive = item.id === activeId

						return (
							<li key={item.id}>
								<a
									href={`#${item.id}`}
									aria-current={isActive ? "location" : undefined}
									className={clsx(
										"block rounded-md px-3 py-2 text-sm/6 transition-colors",
										isActive
											? "bg-blue-500/12 text-white ring-1 ring-blue-400/30"
											: "text-gray-300 hover:bg-white/5 hover:text-white",
										item.level === 3 && "pl-7",
										item.level === 3 && !isActive && "text-gray-500"
									)}
								>
									{item.title}
								</a>
							</li>
						)
					})}
				</ol>
			</nav>
		</div>
	)
}
