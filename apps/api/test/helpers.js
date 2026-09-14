export const createCtx = ({
	email = "user@gmail.com",
	ip = null,
	user_agent = null,
	info = {},
	threats = [],
	trust = [],
	blocklists = [],
	performance = {},
	halt = false
} = {}) => {
	return {
		halt,
		performance: { ...performance },
		threats: [...threats],
		trust: [...trust],
		blocklists: [...blocklists],
		info: { ...info },
		payload: {
			email,
			ip,
			user_agent
		}
	}
}

export const createResponseRecorder = () => {
	let statusCode = 200
	let jsonPayload = null

	return {
		res: {
			status(code) {
				statusCode = code
				return this
			},
			json(payload) {
				jsonPayload = payload
				return payload
			}
		},
		get statusCode() {
			return statusCode
		},
		get jsonPayload() {
			return jsonPayload
		}
	}
}

export const createNextSpy = () => {
	let called = false
	return {
		next() {
			called = true
		},
		get called() {
			return called
		}
	}
}

export const withMeasuredPerformance = () => {
	const previous = process.env.MEASURE_PERFORMANCE
	process.env.MEASURE_PERFORMANCE = "true"

	return () => {
		if(previous === undefined) {
			delete process.env.MEASURE_PERFORMANCE
			return
		}
		process.env.MEASURE_PERFORMANCE = previous
	}
}
