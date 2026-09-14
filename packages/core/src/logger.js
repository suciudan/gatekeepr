import { inspect } from "util"

import moment from "moment"

export default async function logger(text, targetUrl = null) {
	
	if(typeof text !== "string") {
		text = JSON.stringify(inspect(text))
	}
	
	if(!targetUrl) {
		return console.log(text)
	}
	
	try {
		await fetch(targetUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ text })
		})
	} catch(err) {
		console.log(`Unable to post message to Slack`, err.message)
	}
	
}