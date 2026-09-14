export default async function pingAction(req, res) {
	return res.json({ pong: true })
}