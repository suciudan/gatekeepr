import fs from "node:fs/promises"
import path from "node:path"

import { loadDisposablePackageArtifacts } from "./disposable-publisher.js"

export function getDisposableExportOutputDir() {
	if(process.env.DISPOSABLE_EXPORT_OUTPUT_DIR) {
		return path.resolve(process.env.DISPOSABLE_EXPORT_OUTPUT_DIR)
	}
	return path.resolve(import.meta.dirname, "..", "..", "..", "source", "disposable-preview")
}

export async function writeDisposableExportFiles(redisClient, {
	outputDir = getDisposableExportOutputDir()
} = {}) {
	const artifacts = await loadDisposablePackageArtifacts(redisClient)
	await fs.mkdir(outputDir, { recursive: true })
	await fs.writeFile(path.join(outputDir, "disposable.json"), artifacts.disposableJson, "utf8")
	await fs.writeFile(path.join(outputDir, "disposable.txt"), artifacts.disposableTxt, "utf8")
	await fs.writeFile(path.join(outputDir, "disposable-extended.json"), artifacts.disposableExtendedJson, "utf8")

	return {
		outputDir,
		domains: artifacts.domains.length
	}
}
