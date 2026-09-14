import redis from "./redis.js"

const ipToInt = ip => {
	const [a, b, c, d] = ip.split(".").map(n => parseInt(n, 10))
	// pure arithmetic avoids signed bitwise overflow
	return (((a * 16777216) + (b * 65536) + (c * 256) + d) >>> 0)
}

const cidrToRange = cidr => {
	const [ip, prefixStr] = cidr.split("/")
	const prefix = parseInt(prefixStr, 10)
	const ipInt = ipToInt(ip)
	
	if(prefix === 0) return { start: 0 >>> 0, end: 0xFFFFFFFF >>> 0 }
	if(prefix === 32) return { start: ipInt, end: ipInt }
	
	const hostBits = 32 - prefix
	// align down to network start without using risky 0xFFFFFFFF masks
	const start = ((ipInt >>> hostBits) << hostBits) >>> 0
	// size = 2^hostBits (use Math.pow to avoid 1<<31 overflow)
	const size = Math.pow(2, hostBits)
	const end = (start + size - 1) >>> 0
	return { start, end }
}

export const storeIPv4Cidrs = async (namespace, cidrs) => {
	const pipeline = redis.pipeline()
	pipeline.del(namespace)
	for(const cidr of cidrs) {
		const { start, end } = cidrToRange(cidr)
		pipeline.zadd(namespace, start, `${start}:${end}`)
	}
	await pipeline.exec()
}

export const isIPv4InCidrs = async (namespace, ipAddress) => {
	const ipInt = ipToInt(ipAddress)
	const candidates = await redis.zrevrangebyscore(namespace, ipInt, 0, "LIMIT", 0, 32)
	for(const m of candidates) {
		const [sStr, eStr] = m.split(":")
		const start = parseInt(sStr, 10)
		const end = parseInt(eStr, 10)
		// defensive: should already hold because of the score filter
		if(ipInt < start) continue
		if(ipInt <= end) return true
	}
	return false
}

// store a batch of individual IPv4 addresses
export const storeIPv4Batch = async (namespace, ips = []) => {
	const pipeline = redis.pipeline()
	pipeline.del(namespace)
	for(const ip of ips) {
		const ipInt = ipToInt(ip)
		pipeline.zadd(namespace, ipInt, `${ipInt}:${ipInt}`)
	}
	await pipeline.exec()
}