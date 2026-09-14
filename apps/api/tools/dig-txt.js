import dns from "dns/promises"

const res = await dns.resolveTxt("50.226.76.82.origin.asn.cymru.com")
// 50.226.76.82
console.log(res)

process.exit()