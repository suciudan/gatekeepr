import { getDomainInfo } from "@repo/core/whois"

const domain = "digigov.ro"

const domainInfo = await getDomainInfo(domain)
console.log(domainInfo)

process.exit()