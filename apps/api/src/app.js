import express from "express"

import processAction from "./actions/process.js"
import welcomeAction from "./actions/welcome.js"
import pingAction from "./actions/ping.js"

import apiKeyMiddleware from "./middlewares/apiKeyMiddleware.js"
import emailMiddleware from "./middlewares/emailMiddleware.js"
import usageMiddleware from "./middlewares/usageMiddleware.js"
import ctxMiddleware from "./middlewares/ctxMiddleware.js"

export const createApp = ({
	beforeRoutes = [],
	processHandler = processAction,
	welcomeHandler = welcomeAction,
	pingHandler = pingAction,
	apiKeyHandler = apiKeyMiddleware,
	emailHandler = emailMiddleware,
	usageHandler = usageMiddleware,
	ctxHandler = ctxMiddleware
} = {}) => {
	const app = express()

	app.use(express.json())

	for(const middleware of beforeRoutes) {
		app.use(middleware)
	}

	const middlewares = [apiKeyHandler, ctxHandler, emailHandler, usageHandler]

	app.get("/", welcomeHandler)
	app.post("/ping", [apiKeyHandler], pingHandler)
	app.post("/", middlewares, processHandler)

	return app
}
