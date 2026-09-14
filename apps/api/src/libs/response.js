import { measurePerformance } from "@repo/core/performance"

import { resolveFraudStatus } from "./status.js"

export const finalizeCtx = (ctx) => {
	delete ctx.payload
	delete ctx.halt

	if(measurePerformance() !== true) delete ctx.performance

	ctx.status = resolveFraudStatus(ctx.threats)

	return ctx
}
