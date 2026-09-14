import { createAuthMiddleware } from "better-auth/api"

import { createGatekeeprBetterAuthPlugin as createCoreGatekeeprBetterAuthPlugin } from "./index.js"

export * from "./index.js"

export const createGatekeeprBetterAuthPlugin = (options = {}) => {
	return createCoreGatekeeprBetterAuthPlugin({
		...options,
		createAuthMiddleware
	})
}

export const gatekeeprBetterAuth = createGatekeeprBetterAuthPlugin
