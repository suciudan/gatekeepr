"use client"

import { MinusIcon, PlusIcon } from "@heroicons/react/24/solid"
import clsx from "clsx"
import { useState } from "react"

export default function FaqAccordion({ items }) {
	const [openIndex, setOpenIndex] = useState(-1)

	return (
		<div className="space-y-3">
			{items.map((item, index) => {
				const isOpen = openIndex === index

				return (
					<div
						key={item.question}
						className={clsx(
							"rounded-[1.6rem] border px-5 py-4 transition-all duration-200 sm:px-6 sm:py-5",
							isOpen
								? "border-blue-500/25 bg-white/[0.05] shadow-[0_18px_50px_rgba(15,23,42,0.25)]"
								: "border-white/8 bg-black/20 hover:border-blue-500/20 hover:bg-white/[0.04]"
						)}
					>
						<button
							type="button"
							onClick={() => setOpenIndex(isOpen ? -1 : index)}
							className="flex w-full cursor-pointer items-center justify-between gap-6 text-left text-white transition-all hover:text-blue-100"
							aria-expanded={isOpen}
						>
							<span className="text-base/7 font-semibold text-white sm:text-lg/7">
								{item.question}
							</span>
							<span
								className={clsx(
									"flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all sm:h-8 sm:w-8",
									isOpen
										? "border-blue-500/30 bg-blue-500/10 text-blue-200"
										: "border-white/10 bg-white/5 text-blue-300"
								)}
							>
								{isOpen ? (
									<MinusIcon className="size-3.5" />
								) : (
									<PlusIcon className="size-3.5" />
								)}
							</span>
						</button>
						<div className={clsx("pr-4", !isOpen && "hidden")}>
							<div className="mt-4 flex flex-col gap-3">
								<p className="text-base/8 text-gray-300">{item.answer}</p>
							</div>
						</div>
					</div>
				)
			})}
		</div>
	)
}
