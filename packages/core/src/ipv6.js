import redis from "./redis.js"

const FULL_MASK = (1n << 128n) - 1n

const ipv6ToBigInt = (ip) => {
	const s = ip.toLowerCase()
	const parts = s.split("::")
	let left = []
	let right = []
	
	if(parts.length === 1) {
		left = parts[0].split(":")
	} else if (parts.length === 2) {
		left = parts[0] ? parts[0].split(":") : []
		right = parts[1] ? parts[1].split(":") : []
	} else {
		throw new Error("Invalid IPv6 format")
	}
	
	const missing = 8 - (left.length + right.length)
	if(missing < 0) throw new Error("Invalid IPv6: too many hextets")
	
	const hextets = [
		...left,
		...Array(missing).fill("0"),
		...right
	].map(h => h.length ? parseInt(h, 16) : 0)
	
	if(hextets.length !== 8 || hextets.some(x => x < 0 || x > 0xffff))
		throw new Error("Invalid IPv6 hextet")
	
	let v = 0n
	for(const h of hextets) v = (v << 16n) + BigInt(h)
	return v
}

const bigIntToHex32 = (v) => {
	let hex = v.toString(16)
	if (hex.length > 32) throw new Error("Value exceeds 128 bits")
	return hex.padStart(32, "0")
}

const cidrToRange = (cidr) => {
	const [ipStr, pStr] = cidr.split("/")
	const p = Number(pStr)
	if(!(p >= 0 && p <= 128)) throw new Error("Invalid prefix length")
	
	const ip = ipv6ToBigInt(ipStr)
	const hostBits = 128 - p
	const hostMask = hostBits === 0 ? 0n : ((1n << BigInt(hostBits)) - 1n)
	const netMask = FULL_MASK ^ hostMask
	
	const start = ip & netMask
	const end = start | hostMask
	return { start, end }
}

export const storeIPv6Cidrs = async (namespace, cidrs = []) => {
	const pipe = redis.pipeline()
	pipe.del(`${namespace}:starts`)
	pipe.del(`${namespace}:ends`)
	for(const c of cidrs) {
		const { start, end } = cidrToRange(c)
		const sHex = bigIntToHex32(start)
		const eHex = bigIntToHex32(end)
		// ZSET: score=0 for all members so lex order of the 32-hex member is used
		pipe.zadd(`${namespace}:starts`, 0, sHex)
		pipe.hset(`${namespace}:ends`, sHex, eHex)
	}
	await pipe.exec()
}

/**
 * Check if the IP address is in the stored CIDRs
 * @param namespace
 * @param ipv6
 * @returns {Promise<boolean>}
 */

export const isIPv6InCidrs = async (namespace, ipv6) => {
	const ipHex = bigIntToHex32(ipv6ToBigInt(ipv6))
	
	// Greatest start <= ip via lex: ZREVRANGEBYLEX key [max [min LIMIT 0 1
	const arr = await redis.zrevrangebylex(`${namespace}:starts`, `[${ipHex}`, "-", "LIMIT", 0, 1)
	if(!arr || arr.length === 0) return false
	
	const startHex = arr[0]
	const endHex = await redis.hget(`${namespace}:ends`, startHex)
	if (!endHex) return false
	
	// Strings are 32-char lowercase hex → lex compare == numeric compare
	return ipHex <= endHex
}
