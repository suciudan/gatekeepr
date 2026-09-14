import "@repo/core/dotenv"

import fs from "fs/promises"

const res = await fetch("https://www.peeringdb.com/api/net", {
	method: "GET",
	headers: {
		"Accept": "application/json",
		"Authorization": `Api-Key ${process.env.PEERDB_API_KEY}`
	}
})
const json = await res.json()

await fs.writeFile("./src/data/networks.json", JSON.stringify(json, null, 2))