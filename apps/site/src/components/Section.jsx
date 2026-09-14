import clsx from "clsx"

export default function Section({
	id,
	className,
	compact,
	containerClassName = "px-4 lg:px-6 mx-auto max-w-screen-xl",
	children
}) {
	return (
		<section
			className={clsx(
				"lg:scroll-mt-10",
				compact ? "py-12 lg:py-20" : "py-16 lg:py-24",
				className
			)}
			id={id}
		>
			<div className={containerClassName}>
				{children}
			</div>
		</section>
	)
}
