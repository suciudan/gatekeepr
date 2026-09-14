import clsx from "clsx"

export default function Widget({ title, children }) {
	return (
		<div className={clsx(
			"overflow-hidden rounded-lg shadow-sm bg-slate-950",
			"border-2 divide-y",
			"border-slate-800 bg-slate-850 divide-slate-800"
		)}>
			<div className="px-4 py-3 sm:px-6 text-white font-semibold">
				{title}
			</div>
			<div className="text-white">{children}</div>
		</div>
	)
}