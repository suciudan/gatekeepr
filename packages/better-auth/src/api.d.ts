export * from "./index.js"

import type { BetterAuthPlugin, CreateGatekeeprBetterAuthPluginOptions } from "./index.js"

export function createGatekeeprBetterAuthPlugin(options?: Omit<CreateGatekeeprBetterAuthPluginOptions, "createAuthMiddleware">): BetterAuthPlugin
export const gatekeeprBetterAuth: typeof createGatekeeprBetterAuthPlugin
