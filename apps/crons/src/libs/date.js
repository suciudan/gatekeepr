export const createTodayTag = () => {
	return new Date().toISOString().slice(0, 10).replace(/-/g, "")
}