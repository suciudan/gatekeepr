import clsx from "clsx"

export default function SectionAdvTitle({ title, subTitle, children }) {
	return (
		<div className="mx-auto max-w-2xl lg:text-center">
			<h2 className="font-semibold text-blue-600">{title}</h2>
			<p className={clsx(
				"mt-2 text-4xl font-semibold tracking-tight text-pretty sm:text-5xl lg:text-balance",
				"text-white"
			)}>
				{subTitle}
			</p>
			<p className="mt-6 text-lg/8 text-gray-400">
				{children}
			</p>
		</div>
	)
}