import { DepGraph } from "dependency-graph"
import pLimit from "p-limit"

import checks from "../libs/checks.js"
import { finalizeCtx } from "../libs/response.js"

export const buildCheckOrder = (checksConfig) => {
	const graph = new DepGraph()

	for(const name of Object.keys(checksConfig)) {
		graph.addNode(name)
		for(const dep of checksConfig[name].deps) {
			graph.addDependency(name, dep)
		}
	}
	
	return graph.overallOrder()
}

export const createProcessAction = ({
	checksConfig = checks,
	finalize = finalizeCtx,
	limitFactory = pLimit,
	concurrency = 5
} = {}) => {
	const order = buildCheckOrder(checksConfig)

	return async function processAction(req, res) {
		const ctx = req.ctx
		const limit = limitFactory(concurrency)
		const done = new Set()

		while(done.size < order.length) {
			if(ctx.halt) break

			const ready = order.filter(name =>
				!done.has(name) &&
				checksConfig[name].deps.every(dep => done.has(dep))
			)

			await Promise.all(ready.map(name =>
				limit(async () => {
					if(ctx.halt) return
					await checksConfig[name].fn(ctx)
					done.add(name)
				})
			))
		}

		return res.json(finalize(ctx))
	}
}

export default createProcessAction()
