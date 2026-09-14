import { ArrowRightIcon } from "@heroicons/react/24/solid"
import Link from "next/link"
import clsx from "clsx"

export default function JoinButton() {
	return (
		<div className="w-full sm:w-auto flex-col gap-2">
			<Link
				href="/get-free-api-key"
				rel="noopener noreferrer"
				className={clsx(
					"inline-flex w-full items-center justify-center gap-2 rounded-lg px-7 py-3 sm:w-auto",
					"bg-blue-600 text-[15px] font-semibold text-white transition-all",
					"hover:bg-blue-500 hover:shadow-[0_0_30px_rgba(37,99,235,0.3)]",
					"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
					"text-center"
				)}
			>
				Start Free <ArrowRightIcon className="size-4" />
			</Link>
		</div>
	)
}
