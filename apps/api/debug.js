import z from "zlib"

// Random-vs-Real classifier for email local-parts (no dictionaries, no names)
// Style: double quotes, no semicolons

export function classifyLocalPart(local) {
	const s = String(local || "").trim()
	if (!s) return result("unclear", { reason: "empty" })
	
	const lower = s.toLowerCase()
	const len = lower.length
	
	const entropy = shannonEntropy(lower)
	const minEntropy = minEntropyBits(lower)
	const diversity = uniqueCharRatio(lower)
	const { alpha, digit, otherCount, alphabetSize } = detectCharSets(lower)
	const maxEntropy = Math.log2(Math.max(1, alphabetSize))
	const normalizedEntropy = maxEntropy ? entropy / maxEntropy : 0
	
	const lzComplexity = lz76Complexity(lower)            // higher → more random
	const lzNorm = lzComplexity / Math.max(1, len)
	
	const compRatio = compressRatio(lower)                // random compresses poorly → ratio closer to 1
	const bigramUniq = bigramUniqueness(lower)            // unique bigrams / total bigrams
	const classTrans = classTransitionRate(lower)         // transitions between [a-z], [0-9], sep
	
	const digitDensity = (lower.match(/\d/g) || []).length / Math.max(1, len)
	const longestDigitRun = longestRun(lower, /[0-9]/)
	const longestAlphaRun = longestRun(lower, /[a-z]/)
	const repeatingRun = longestRepeatingRun(lower)
	
	const separatorCount = (lower.match(/[._+\-]/g) || []).length
	const alternatingIndex = alternatingPatternIndex(lower) // high when chars flip type often
	
	// Combine into a randomness score (0..1). Tune weights per your dataset.
	const randomnessScore = clamp01(
		0.28 * normalizedEntropy +
		0.14 * minEntropy / Math.max(1, Math.log2(alphabetSize || 1)) +
		0.14 * diversity +
		0.14 * lzNorm +
		0.10 * bigramUniq +
		0.06 * classTrans +
		0.06 * alternatingIndex +
		0.04 * Math.min(1, digitDensity * 2.2) +
		0.04 * (longestDigitRun >= 5 ? 1 : 0)
	)
	
	// Signals that reduce randomness (structured/human-ish without dictionaries)
	const structureScore = clamp01(
		0.35 * Math.min(1, longestAlphaRun / 6) +       // long alpha runs feel human
		0.25 * Math.max(0, 1 - repeatingRun / 4) +      // not the same char over and over
		0.20 * Math.max(0, 1 - separatorBurst(separatorCount, len)) +
		0.20 * Math.max(0, 1 - bigramUniq)              // fewer unique bigrams → more structure
	)
	
	// Decision (keep it simple and tunable)
	let label = "unclear"
	if (
		len >= 8 &&
		randomnessScore >= 0.7 &&
		structureScore <= 0.55 &&
		!(digitDensity < 0.15 && longestAlphaRun >= 6)   // avoid mislabeling clean alpha names
	) label = "random"
	else if (
		structureScore >= 0.7 &&
		randomnessScore <= 0.6 &&
		repeatingRun <= 3
	) label = "real"
	
	return result(label, {
		length: len,
		entropyBits: round(entropy, 3),
		minEntropyBits: round(minEntropy, 3),
		maxEntropyBits: round(maxEntropy, 3),
		normalizedEntropy: round(normalizedEntropy, 3),
		diversity: round(diversity, 3),
		lzComplexity,
		lzNorm: round(lzNorm, 3),
		compressRatio: round(compRatio, 3),
		bigramUniq: round(bigramUniq, 3),
		classTransitions: round(classTrans, 3),
		alternatingIndex: round(alternatingIndex, 3),
		digitDensity: round(digitDensity, 3),
		longestDigitRun,
		longestAlphaRun,
		repeatingRun,
		separatorCount,
		randomnessScore: round(randomnessScore, 3),
		structureScore: round(structureScore, 3)
	})
}

function result(label, details) {
	return { label, details }
}

function detectCharSets(s) {
	let alpha = false, digit = false, other = new Set()
	for (const ch of s) {
		if (/[a-z]/.test(ch)) alpha = true
		else if (/[0-9]/.test(ch)) digit = true
		else other.add(ch)
	}
	let alphabetSize = 0
	if (alpha) alphabetSize += 26
	if (digit) alphabetSize += 10
	alphabetSize += other.size
	return { alpha, digit, otherCount: other.size, alphabetSize }
}

function shannonEntropy(s) {
	if (!s.length) return 0
	const map = new Map()
	for (const ch of s) map.set(ch, (map.get(ch) || 0) + 1)
	let h = 0
	for (const [, c] of map) {
		const p = c / s.length
		h -= p * Math.log2(p)
	}
	return h
}

function minEntropyBits(s) {
	if (!s.length) return 0
	const map = new Map()
	for (const ch of s) map.set(ch, (map.get(ch) || 0) + 1)
	let pmax = 0
	for (const [, c] of map) pmax = Math.max(pmax, c / s.length)
	return -Math.log2(Math.max(pmax, 1e-12))
}

function uniqueCharRatio(s) {
	return new Set(s).size / Math.max(1, s.length)
}

function longestRun(s, regex) {
	let best = 0, cur = 0
	for (const ch of s) {
		if (regex.test(ch)) {
			cur += 1
			if (cur > best) best = cur
		} else {
			cur = 0
		}
	}
	return best
}

function longestRepeatingRun(s) {
	if (!s) return 0
	let best = 1, cur = 1
	for (let i = 1; i < s.length; i++) {
		if (s[i] === s[i - 1]) {
			cur += 1
			if (cur > best) best = cur
		} else {
			cur = 1
		}
	}
	return best
}

// Lempel–Ziv (LZ76) complexity: number of phrases in incremental parsing
function lz76Complexity(s) {
	let i = 0, k = 1, l = 1, c = 1
	const n = s.length
	if (n === 0) return 0
	while (true) {
		if (s[i + k - 1] === s[l + k - 1]) {
			k += 1
			if (l + k > n) {
				c += 1
				break
			}
		} else {
			if (k > 1) {
				i = 0
				l += 1
				k = 1
				if (l === n) {
					c += 1
					break
				}
			} else {
				i += 1
				if (i === l) {
					c += 1
					l += 1
					if (l === n) break
					i = 0
				}
			}
		}
	}
	return c
}

// Compression ratio via zlib (best-effort; short strings are noisy)
function compressRatio(s) {
	try {
		const buf = Buffer.from(s, "utf8")
		const def = z.deflateRawSync(buf)
		return def.length / Math.max(1, buf.length)
	} catch {
		// If zlib isn't available in the environment, fallback to a neutral value
		return 1
	}
}

function bigramUniqueness(s) {
	if (s.length < 2) return 0
	const seen = new Set()
	for (let i = 0; i < s.length - 1; i++) {
		seen.add(s.slice(i, i + 2))
	}
	return seen.size / (s.length - 1)
}

function classTransitionRate(s) {
	if (s.length < 2) return 0
	const cls = ch => /[a-z]/.test(ch) ? "a" : (/[0-9]/.test(ch) ? "d" : "o")
	let trans = 0
	for (let i = 1; i < s.length; i++) {
		if (cls(s[i]) !== cls(s[i - 1])) trans += 1
	}
	return trans / (s.length - 1)
}

function alternatingPatternIndex(s) {
	if (s.length < 3) return 0
	let alt = 0
	for (let i = 2; i < s.length; i++) {
		const a = classOf(s[i - 2]), b = classOf(s[i - 1]), c = classOf(s[i])
		if (a !== b && b !== c && a === c) alt += 1
	}
	return alt / (s.length - 2)
}

function classOf(ch) {
	if (/[a-z]/.test(ch)) return 0
	if (/[0-9]/.test(ch)) return 1
	return 2
}

function separatorBurst(sepCount, len) {
	// penalize many separators relative to length
	return sepCount / Math.max(1, Math.log2(len + 1))
}

function clamp01(x) {
	if (x < 0) return 0
	if (x > 1) return 1
	return x
}

function round(x, n) {
	const p = Math.pow(10, n)
	return Math.round(x * p) / p
}

[
	"hrgfewtyyjtg",
	"popsamuel",
	"johndoe",
	"samuelpop90",
	"popescumihai1990",
	"andew.anderson.99",
	"support",
	"jane.doe.2025",
	"user123456789",
	"qwertyuiop",
	"maria.popescu",
	"alex+test",
	"test+3f9xQz8p",
	"j.o.h.n.d.o.e",
	"random_name_42",
	"aaabbbcccddd",
	"xyz123xyz123",
	"0xdeadbeef",
	"nathan.smith",
	"contact",
	"admin",
	"info",
	"t3st.acc0unt",
	"tmp8491xkqp",
	"botuser001",
	"fakeaccount2025",
	"legit_user",
	"zzzzzzzzzzzz",
	"123456",
	"9f83h2kd92k",
	"marketing.team",
	"ceo-office",
	"user+spamfilter",
	"alpha_beta.gamma",
	"newuser_2025",
	"temporary_11",
	"dev.test.account",
	"promo001",
	"r4nd0mstr1ng",
	"genuinecustomer",
	"abuser+noise123",
	"unique_visitor",
	"service.bot",
	"root",
	"it_support",
	"data.team",
	"qa.test",
	"user_01_02_03",
	"abcdef1234567890"
].forEach(s => console.log(s, classifyLocalPart(s)))

process.exit()