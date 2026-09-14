export default function LearnMore({ href }) {
	return (
		<a
			href={href}
			className="text-sm/6 font-semibold text-blue-600 hover:text-blue-500"
		>
			Learn more <span aria-hidden="true">→</span>
		</a>
	)
}