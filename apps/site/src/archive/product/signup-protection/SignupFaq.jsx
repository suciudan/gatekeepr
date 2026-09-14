"use client"

import clsx from "clsx"
import { ChevronDown } from "lucide-react"
import { useState } from "react"

export default function SignupFaq({ items }) {
	const [openIndex, setOpenIndex] = useState(0)

	return (
		<div className="space-y-3">
			{items.map((item, index) => {
				const isOpen = openIndex === index

				return (
					<div
						key={item.question}
						className="overflow-hidden rounded-xl border border-white/8 bg-[#0f1525]"
					>
						<button
							type="button"
							onClick={() => setOpenIndex(isOpen ? -1 : index)}
							className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
							aria-expanded={isOpen}
						>
							<span className="text-[15px] font-medium text-white">
								{item.question}
							</span>
							<ChevronDown
								className={clsx(
									"size-4 shrink-0 text-gray-500 transition-transform duration-200",
									isOpen && "rotate-180"
								)}
								strokeWidth={2}
							/>
						</button>
						<div
							className={clsx(
								"overflow-hidden transition-all duration-300",
								isOpen ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
							)}
						>
							<p className="px-6 pb-5 text-sm/8 text-gray-300">
								{item.answer}
							</p>
						</div>
					</div>
				)
			})}
		</div>
	)
}
