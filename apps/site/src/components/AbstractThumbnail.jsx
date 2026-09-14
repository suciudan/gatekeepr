import clsx from "clsx"

import { getAbstractThumbnailConfig } from "@/libs/abstract-thumbnail"

function round(value) {
	return Math.round(value * 100) / 100
}

function CheckerCut({ cut }) {
	const cells = []
	const count = Math.max(4, Math.round(cut.size / cut.cell))

	for(let row = 0; row < count; row++) {
		for(let column = 0; column < count; column++) {
			cells.push(
				<rect
					key={`${row}-${column}`}
					x={round(cut.x + (column * cut.cell))}
					y={round(cut.y + (row * cut.cell))}
					width={cut.cell + 0.2}
					height={cut.cell + 0.2}
					fill={(row + column) % 2 === 0 ? cut.primary : cut.secondary}
				/>
			)
		}
	}

	return (
		<g transform={`rotate(${cut.rotate} ${round(cut.x + (cut.size / 2))} ${round(cut.y + (cut.size / 2))})`}>
			{cells}
		</g>
	)
}

function Ribbon({ ribbon }) {
	return (
		<g>
			<path
				d={ribbon.path}
				fill="none"
				stroke={ribbon.shadowColor}
				strokeWidth={ribbon.width + 4}
				strokeLinecap="round"
				strokeLinejoin="round"
				transform="translate(0 2)"
			/>
			<path
				d={ribbon.path}
				fill="none"
				stroke={ribbon.color}
				strokeWidth={ribbon.width}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{ribbon.detailLines.map((detail, index) => (
				<path
					key={index}
					d={detail.path}
					fill="none"
					stroke={detail.color}
					strokeWidth={detail.width}
					strokeLinecap="round"
					strokeLinejoin="round"
					opacity={detail.opacity}
				/>
			))}
		</g>
	)
}

function Splash({ splash }) {
	return (
		<path
			d={splash.path}
			fill={splash.fill}
			stroke={splash.stroke}
			strokeWidth={splash.strokeWidth}
			opacity={splash.opacity}
			transform={`rotate(${splash.rotate} ${splash.cx} ${splash.cy})`}
			strokeLinejoin="round"
		/>
	)
}

function Shard({ shard }) {
	return (
		<polygon
			points={shard.points}
			fill={shard.fill}
			opacity={shard.opacity}
			stroke={shard.stroke}
			strokeWidth={shard.strokeWidth}
			strokeLinejoin="round"
		/>
	)
}

function Pod({ pod }) {
	return (
		<g transform={`rotate(${pod.rotate} ${pod.cx} ${pod.cy})`}>
			<ellipse
				cx={pod.cx}
				cy={pod.cy}
				rx={pod.rx}
				ry={pod.ry}
				fill={pod.fill}
				stroke={pod.stroke}
				strokeWidth={pod.strokeWidth}
			/>
			<path
				d={`M ${round(pod.cx - (pod.rx * 0.45))} ${round(pod.cy - (pod.ry * 0.25))} Q ${round(pod.cx)} ${round(pod.cy - pod.ry)} ${round(pod.cx + (pod.rx * 0.4))} ${round(pod.cy - (pod.ry * 0.1))}`}
				fill="none"
				stroke="rgba(255,255,255,0.32)"
				strokeWidth={Math.max(0.5, pod.strokeWidth * 0.45)}
				strokeLinecap="round"
			/>
		</g>
	)
}

export default function AbstractThumbnail({ seed, family, surface = "blog-card", className }) {
	const config = getAbstractThumbnailConfig(seed, { family, surface })
	const gradientId = `${config.id}-gradient`
	const grainId = `${config.id}-grain`

	return (
		<div
			aria-hidden="true"
			className={clsx("relative isolate overflow-hidden bg-[#05060f]", className)}
		>
			<svg
				viewBox={config.viewBox}
				className="absolute inset-0 h-full w-full"
				preserveAspectRatio="xMidYMid slice"
				role="presentation"
			>
				<defs>
					<linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stopColor={config.background.gradient[0]} />
						<stop offset="56%" stopColor={config.background.gradient[1]} />
						<stop offset="100%" stopColor={config.background.gradient[2]} />
					</linearGradient>
					<pattern id={grainId} width="12" height="12" patternUnits="userSpaceOnUse">
						<circle cx="1.25" cy="1.25" r="0.9" fill="rgba(255,255,255,0.5)" />
						<circle cx="8.8" cy="3.4" r="0.7" fill="rgba(255,255,255,0.38)" />
						<circle cx="5.4" cy="8.9" r="0.6" fill="rgba(255,255,255,0.3)" />
					</pattern>
				</defs>

				<rect width={config.width} height={config.height} fill={`url(#${gradientId})`} />

				{config.backgroundShapes.map((shape, index) => (
					<path
						key={`shape-${index}`}
						d={shape.path}
						fill={shape.fill}
						opacity={shape.opacity}
					/>
				))}

				{config.shards.map((shard, index) => (
					<Shard key={`shard-${index}`} shard={shard} />
				))}

				{config.splashes.map((splash, index) => (
					<Splash key={`splash-${index}`} splash={splash} />
				))}

				{config.checkerCuts.map((cut, index) => (
					<CheckerCut key={`cut-${index}`} cut={cut} />
				))}

				{config.ribbons.map((ribbon, index) => (
					<Ribbon key={`ribbon-${index}`} ribbon={ribbon} />
				))}

				{config.pods.map((pod, index) => (
					<Pod key={`pod-${index}`} pod={pod} />
				))}

				<rect width={config.width} height={config.height} fill={`url(#${grainId})`} opacity={config.grainOpacity} />
			</svg>

			<div
				className="absolute inset-0 opacity-45 mix-blend-screen"
				style={{
					backgroundImage: "radial-gradient(circle at 18% 12%, rgba(255,255,255,0.18) 0%, transparent 26%), radial-gradient(circle at 84% 18%, rgba(255,255,255,0.12) 0%, transparent 22%)",
				}}
			/>
			<div
				className="absolute inset-0"
				style={{
					backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 30%, rgba(3,6,16,0.12) 74%, rgba(2,4,14,0.54) 100%)",
				}}
			/>
			<div
				className="absolute inset-0 rounded-[inherit] ring-1 ring-white/10"
				style={{
					boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -72px 120px rgba(4,6,18,0.32), inset 0 0 0 1px ${config.frame}`,
				}}
			/>
		</div>
	)
}
