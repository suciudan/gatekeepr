export default function (req, res) {
	res.set("X-Robots-Tag", "noindex, nofollow")
	return res.json({
		message: "Welcome to the Gatekeepr API!"
	})
}
