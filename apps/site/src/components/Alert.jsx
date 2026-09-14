import clsx from "clsx"

export default function Alert({ children, className }) {
	return (
		<div className={clsx(
			"bg-transparent border-2 border-blue-600 text-blue-500 px-4 py-3 rounded-lg font-semibold text-sm",
			className
		)}>
			{children}
		</div>
	)
}