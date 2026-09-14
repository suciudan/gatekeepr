const DEFAULT_SEED = "gatekeepr"

const FAMILY_ORDER = ["flow", "splash", "shards", "hybrid", "cutout"]

const SURFACE_PRESETS = {
	"blog-card": {
		width: 180,
		height: 120,
		detail: 0.92,
	},
	"blog-hero": {
		width: 240,
		height: 102,
		detail: 1.04,
	},
}

const PALETTE_BANK = [
	{
		background: ["#f6d7ea", "#9c93d1", "#12a2cb"],
		field: "#f6ecd4",
		ink: "#0b1b4d",
		cobalt: "#2468ff",
		aqua: "#79d9d5",
		lilac: "#a89ede",
		blush: "#f2b6c9",
		orange: "#ff6b16",
		yellow: "#f1bf00",
		mint: "#cfead8",
		frame: "#ffffff20",
	},
	{
		background: ["#efe1cb", "#66b4b6", "#6a5bc4"],
		field: "#f7efde",
		ink: "#13224d",
		cobalt: "#1591df",
		aqua: "#56c7c6",
		lilac: "#b7aee2",
		blush: "#f2b2c4",
		orange: "#ff7017",
		yellow: "#ffc400",
		mint: "#d6ecd7",
		frame: "#ffffff20",
	},
	{
		background: ["#c5e7de", "#9b95d5", "#2496d6"],
		field: "#f8edd8",
		ink: "#081942",
		cobalt: "#2852df",
		aqua: "#5fc3c1",
		lilac: "#b6a9e5",
		blush: "#f3bccb",
		orange: "#ff7a19",
		yellow: "#f1c000",
		mint: "#d7f1e4",
		frame: "#ffffff24",
	},
]

function hashSeed(input) {
	let hash = 1779033703 ^ input.length

	for(let index = 0; index < input.length; index++) {
		hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353)
		hash = (hash << 13) | (hash >>> 19)
	}

	hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
	hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
	return (hash ^ (hash >>> 16)) >>> 0
}

function createRandom(seed) {
	let value = seed >>> 0

	return () => {
		value += 0x6D2B79F5
		let result = value
		result = Math.imul(result ^ (result >>> 15), result | 1)
		result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
		return ((result ^ (result >>> 14)) >>> 0) / 4294967296
	}
}

function round(value) {
	return Math.round(value * 100) / 100
}

function randomRange(random, min, max) {
	return min + ((max - min) * random())
}

function randomInt(random, min, max) {
	return Math.floor(randomRange(random, min, max + 1))
}

function pick(random, values) {
	return values[Math.floor(random() * values.length)]
}

function hexToRgba(hex, alpha = 1) {
	const value = hex.replace("#", "")
	const normalized = value.length === 3
		? value.split("").map((entry) => `${entry}${entry}`).join("")
		: value
	const int = Number.parseInt(normalized, 16)
	const red = (int >> 16) & 255
	const green = (int >> 8) & 255
	const blue = int & 255

	return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function createPoint(x, y) {
	return {
		x: round(x),
		y: round(y),
	}
}

function pointsToPolygon(points) {
	return points.map((point) => `${point.x},${point.y}`).join(" ")
}

function createSmoothPath(points) {
	if(points.length < 2) return ""

	let path = `M ${points[0].x} ${points[0].y}`

	for(let index = 1; index < points.length - 1; index++) {
		const current = points[index]
		const next = points[index + 1]
		const midpointX = round((current.x + next.x) / 2)
		const midpointY = round((current.y + next.y) / 2)
		path += ` Q ${current.x} ${current.y} ${midpointX} ${midpointY}`
	}

	const penultimate = points[points.length - 2]
	const last = points[points.length - 1]
	path += ` Q ${penultimate.x} ${penultimate.y} ${last.x} ${last.y}`

	return path
}

function createClosedSmoothPath(points) {
	return `${createSmoothPath([...points, points[0]])} Z`
}

function createBlobPoints(random, width, height, scale = 1) {
	const centerX = randomRange(random, width * 0.16, width * 0.84)
	const centerY = randomRange(random, height * 0.14, height * 0.86)
	const radiusX = randomRange(random, width * 0.12, width * 0.3) * scale
	const radiusY = randomRange(random, height * 0.12, height * 0.28) * scale
	const points = []
	const total = randomInt(random, 6, 9)

	for(let index = 0; index < total; index++) {
		const angle = (Math.PI * 2 * index) / total
		const jitter = randomRange(random, 0.68, 1.22)
		points.push(createPoint(
			centerX + (Math.cos(angle) * radiusX * jitter),
			centerY + (Math.sin(angle) * radiusY * jitter),
		))
	}

	return points
}

function createBlobPath(random, width, height, scale = 1) {
	return createClosedSmoothPath(createBlobPoints(random, width, height, scale))
}

function createBackgroundShapes(random, palette, preset) {
	return [
		{
			path: createBlobPath(random, preset.width, preset.height, 1.1),
			fill: palette.field,
			opacity: round(randomRange(random, 0.82, 0.95)),
		},
		{
			path: createBlobPath(random, preset.width, preset.height, 0.88),
			fill: pick(random, [palette.aqua, palette.lilac, palette.blush, palette.mint]),
			opacity: round(randomRange(random, 0.5, 0.72)),
		},
	]
}

function createRibbonPoints(random, width, height, index, total) {
	const direction = pick(random, ["rise", "fall", "sweep"])
	const steps = 5
	const points = []
	const baseline = (height * (index + 1)) / (total + 1)
	const amplitude = randomRange(random, height * 0.1, height * 0.24)
	const slope = direction === "rise" ? -1 : direction === "fall" ? 1 : randomRange(random, -0.35, 0.35)

	for(let step = 0; step < steps; step++) {
		const progress = step / (steps - 1)
		const x = (-18 + (progress * (width + 36))) + randomRange(random, -8, 8)
		const y = baseline
			+ (Math.sin((progress * Math.PI * randomRange(random, 0.85, 1.55)) + (index * 0.65)) * amplitude)
			+ (slope * (progress - 0.5) * height * 0.32)
			+ randomRange(random, -10, 10)
		points.push(createPoint(x, y))
	}

	return points
}

function offsetRibbonPoints(points, offset, phase) {
	return points.map((point, index) => createPoint(
		point.x + (Math.sin((index * 1.17) + phase) * offset * 0.55),
		point.y + (Math.cos((index * 1.09) + phase) * offset),
	))
}

function paletteColors(palette) {
	return [
		palette.cobalt,
		palette.aqua,
		palette.lilac,
		palette.blush,
		palette.orange,
		palette.yellow,
		palette.ink,
		palette.mint,
		palette.field,
	]
}

function createRibbon(random, palette, preset, detailBias, index, total) {
	const points = createRibbonPoints(random, preset.width, preset.height, index, total)
	const baseWidth = randomRange(random, preset.height * 0.08, preset.height * 0.22) * preset.detail
	const colors = paletteColors(palette)
	const detailLines = []
	const detailCount = randomInt(random, Math.max(1, Math.round(detailBias)), Math.max(2, Math.round(detailBias + 2)))

	for(let lineIndex = 0; lineIndex < detailCount; lineIndex++) {
		const offset = randomRange(random, -baseWidth * 0.18, baseWidth * 0.18)
		const path = createSmoothPath(offsetRibbonPoints(points, offset, randomRange(random, 0, Math.PI * 2)))
		detailLines.push({
			path,
			width: round(Math.max(1.1, baseWidth * randomRange(random, 0.06, 0.16))),
			color: pick(random, colors),
			opacity: round(randomRange(random, 0.42, 0.84)),
		})
	}

	return {
		path: createSmoothPath(points),
		width: round(baseWidth),
		color: pick(random, colors),
		shadowColor: hexToRgba(palette.ink, 0.24),
		detailLines,
	}
}

function createSplash(random, palette, preset, filled = true) {
	const points = createBlobPoints(random, preset.width, preset.height, randomRange(random, 0.48, 1.04))
	const colors = paletteColors(palette)
	const path = createClosedSmoothPath(points)

	return {
		path,
		fill: filled ? pick(random, colors) : "none",
		stroke: pick(random, [palette.ink, palette.aqua, palette.field, palette.orange]),
		strokeWidth: round(randomRange(random, 1.2, 3.4)),
		opacity: round(randomRange(random, 0.46, 0.88)),
		rotate: round(randomRange(random, -24, 24)),
		cx: round(points.reduce((sum, point) => sum + point.x, 0) / points.length),
		cy: round(points.reduce((sum, point) => sum + point.y, 0) / points.length),
	}
}

function createShard(random, palette, preset) {
	const centerX = randomRange(random, -8, preset.width + 8)
	const centerY = randomRange(random, -8, preset.height + 8)
	const angle = randomRange(random, 0, Math.PI * 2)
	const points = []
	const size = randomRange(random, preset.height * 0.08, preset.height * 0.28)
	const corners = randomInt(random, 3, 5)

	for(let index = 0; index < corners; index++) {
		const localAngle = angle + ((Math.PI * 2 * index) / corners) + randomRange(random, -0.3, 0.3)
		const radius = size * randomRange(random, 0.5, 1.18)
		points.push(createPoint(
			centerX + (Math.cos(localAngle) * radius),
			centerY + (Math.sin(localAngle) * radius),
		))
	}

	return {
		points: pointsToPolygon(points),
		fill: pick(random, [palette.orange, palette.yellow, palette.cobalt, palette.ink, palette.aqua, palette.blush, palette.lilac]),
		opacity: round(randomRange(random, 0.42, 0.86)),
		stroke: pick(random, [palette.field, palette.ink, palette.aqua]),
		strokeWidth: round(randomRange(random, 0.8, 2.1)),
	}
}

function createPod(random, palette, preset) {
	return {
		cx: round(randomRange(random, 12, preset.width - 12)),
		cy: round(randomRange(random, 10, preset.height - 10)),
		rx: round(randomRange(random, 2.8, preset.width * 0.055)),
		ry: round(randomRange(random, 2.2, preset.height * 0.05)),
		rotate: round(randomRange(random, -70, 70)),
		fill: pick(random, [palette.ink, palette.orange, palette.cobalt, palette.lilac, palette.blush, palette.field]),
		stroke: pick(random, [palette.field, palette.ink, palette.aqua]),
		strokeWidth: round(randomRange(random, 0.8, 1.8)),
	}
}

function createCheckerCut(random, palette, preset) {
	const size = round(randomRange(random, preset.height * 0.15, preset.height * 0.28))
	const cell = round(size / randomInt(random, 4, 5))

	return {
		x: round(randomRange(random, -2, preset.width - size + 2)),
		y: round(randomRange(random, -2, preset.height - size + 2)),
		size,
		cell,
		rotate: round(randomRange(random, -18, 18)),
		primary: palette.ink,
		secondary: palette.field,
	}
}

function emptyScene() {
	return {
		backgroundShapes: [],
		ribbons: [],
		splashes: [],
		shards: [],
		pods: [],
		checkerCuts: [],
	}
}

function buildFlowScene(random, palette, preset) {
	const scene = emptyScene()
	scene.backgroundShapes = createBackgroundShapes(random, palette, preset)
	const ribbonCount = randomInt(random, 4, 6)
	scene.ribbons = Array.from({ length: ribbonCount }, (_, index) => createRibbon(random, palette, preset, 2.2, index, ribbonCount))
	scene.splashes = Array.from({ length: randomInt(random, 1, 2) }, () => createSplash(random, palette, preset, false))
	scene.shards = Array.from({ length: randomInt(random, 1, 3) }, () => createShard(random, palette, preset))
	scene.pods = Array.from({ length: randomInt(random, 7, 11) }, () => createPod(random, palette, preset))
	return scene
}

function buildSplashScene(random, palette, preset) {
	const scene = emptyScene()
	scene.backgroundShapes = createBackgroundShapes(random, palette, preset)
	scene.splashes = Array.from({ length: randomInt(random, 4, 7) }, (_, index) => createSplash(random, palette, preset, index % 3 !== 0))
	scene.shards = Array.from({ length: randomInt(random, 2, 5) }, () => createShard(random, palette, preset))
	scene.ribbons = Array.from({ length: randomInt(random, 1, 2) }, (_, index, array) => createRibbon(random, palette, preset, 1.4, index, array.length || 1))
	scene.pods = Array.from({ length: randomInt(random, 5, 9) }, () => createPod(random, palette, preset))
	return scene
}

function buildShardScene(random, palette, preset) {
	const scene = emptyScene()
	scene.backgroundShapes = createBackgroundShapes(random, palette, preset)
	scene.shards = Array.from({ length: randomInt(random, 9, 16) }, () => createShard(random, palette, preset))
	scene.splashes = Array.from({ length: randomInt(random, 1, 3) }, () => createSplash(random, palette, preset, false))
	scene.ribbons = Array.from({ length: randomInt(random, 0, 2) }, (_, index, array) => createRibbon(random, palette, preset, 1.2, index, Math.max(1, array.length)))
	scene.pods = Array.from({ length: randomInt(random, 3, 7) }, () => createPod(random, palette, preset))
	return scene
}

function buildHybridScene(random, palette, preset) {
	const scene = emptyScene()
	scene.backgroundShapes = createBackgroundShapes(random, palette, preset)
	const ribbonCount = randomInt(random, 2, 4)
	scene.ribbons = Array.from({ length: ribbonCount }, (_, index) => createRibbon(random, palette, preset, 2.6, index, ribbonCount))
	scene.splashes = Array.from({ length: randomInt(random, 2, 4) }, () => createSplash(random, palette, preset, true))
	scene.shards = Array.from({ length: randomInt(random, 4, 8) }, () => createShard(random, palette, preset))
	scene.pods = Array.from({ length: randomInt(random, 6, 11) }, () => createPod(random, palette, preset))
	scene.checkerCuts = Array.from({ length: randomInt(random, 0, 2) }, () => createCheckerCut(random, palette, preset))
	return scene
}

function buildCutoutScene(random, palette, preset) {
	const scene = buildHybridScene(random, palette, preset)
	scene.checkerCuts = Array.from({ length: randomInt(random, 1, 3) }, () => createCheckerCut(random, palette, preset))
	scene.shards = scene.shards.concat(Array.from({ length: randomInt(random, 2, 4) }, () => createShard(random, palette, preset)))
	return scene
}

const SCENE_BUILDERS = {
	flow: buildFlowScene,
	splash: buildSplashScene,
	shards: buildShardScene,
	hybrid: buildHybridScene,
	cutout: buildCutoutScene,
}

export function getAbstractThumbnailConfig(seed, options = {}) {
	const normalizedSeed = typeof seed === "string" && seed.trim() ? seed.trim() : DEFAULT_SEED
	const surface = SURFACE_PRESETS[options.surface] ? options.surface : "blog-card"
	const requestedFamily = FAMILY_ORDER.includes(options.family) ? options.family : null
	const family = requestedFamily || FAMILY_ORDER[hashSeed(`${normalizedSeed}:${surface}:family`) % FAMILY_ORDER.length]
	const palette = PALETTE_BANK[hashSeed(`${normalizedSeed}:${surface}:palette`) % PALETTE_BANK.length]
	const preset = SURFACE_PRESETS[surface]
	const random = createRandom(hashSeed(`${normalizedSeed}:${surface}:${family}:scene`))
	const scene = SCENE_BUILDERS[family](random, palette, preset)
	const idBase = `${normalizedSeed}:${surface}:${family}`

	return {
		id: `thumb-${hashSeed(idBase).toString(36)}`,
		family,
		surface,
		palette,
		seedKey: normalizedSeed,
		viewBox: `0 0 ${preset.width} ${preset.height}`,
		width: preset.width,
		height: preset.height,
		background: {
			gradient: palette.background,
		},
		backgroundShapes: scene.backgroundShapes,
		ribbons: scene.ribbons,
		splashes: scene.splashes,
		shards: scene.shards,
		pods: scene.pods,
		checkerCuts: scene.checkerCuts,
		grainOpacity: round(randomRange(random, 0.035, 0.075)),
		frame: palette.frame,
	}
}
