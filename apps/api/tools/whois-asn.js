import { whoisAsn } from "whoiser"

const res = await whoisAsn("AS24940")
console.log(res)
process.exit()