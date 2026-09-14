import fs from "fs/promises"

export const readConf = async (path) => {
	const conf = await fs.readFile(path, "utf-8")
	return conf.split(/\r?\n/)
}