import { PaperAirplaneIcon } from "@heroicons/react/24/outline"
import clsx from "clsx"

import Loader from "@/components/Loader"

export default function Input({
	label, name, placeholder, type, loading, onChange, value, error, inlineSubmit = false
}) {
	return (
		<div>
			<label htmlFor="site" className="block mb-2 text-sm font-semibold text-gray-300">
				{label}
			</label>
			<div className="relative">
				<input
					type={type} name={name} id={name}
					className={clsx(
						"border-2 text-sm rounded-lg block w-full p-4 py-3 focus:outline-none",
						inlineSubmit && "sm:pr-10",
						"transition-all",
						"bg-gray-950 border-slate-700 placeholder-gray-400 text-white",
						"focus:ring-blue-600 focus:border-blue-600",
						!loading && "hover:border-blue-500",
						loading && "opacity-50"
					)}
					placeholder={placeholder}
					onChange={(event) => onChange(event.target.value)}
					disabled={loading}
					required={true}
					value={value}
				/>
				{inlineSubmit && (
					<button
						type="submit"
						className={clsx(
							"mt-3 flex justify-between items-center w-full relative",
							"border-2 px-4 py-2 rounded-lg",
							"sm:absolute sm:right-0 sm:top-0 sm:bottom-0 sm:pr-3 sm:w-auto sm:mt-0 sm:border-0",
							"sm:pl-0 sm:py-0 sm:pr-3 sm:rounded-none",
							" text-blue-600 transition-all",
							!loading && "hover:text-blue-400 cursor-pointer"
						)}
					>
						<span className={clsx("text-sm sm:hidden", loading && "opacity-0")}>
							Verify your email
						</span>
						<PaperAirplaneIcon className={clsx("size-6", loading && "opacity-0")} />
						<div className="absolute inset-0 flex justify-center items-center sm:static">
							{loading && <Loader className="size-6" />}
						</div>
					</button>
				)}
			</div>
			{error && (
				<div className="text-sm mt-2 text-red-500 font-semibold">{error}</div>
			)}
		</div>
	)
}