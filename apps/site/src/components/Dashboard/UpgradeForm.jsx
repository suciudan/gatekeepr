"use client"

import isEmail from "validator/lib/isEmail"

import { useRef, useState } from "react"
import clsx from "clsx"

import Input from "@/components/Form/Input"
import Loader from "@/components/Loader"

import { upgradeAction } from "@/actions/upgrade"

export default function UpgradeForm({ user }) {
	
	const [email, setEmail] = useState(isEmail(user.email) ? user.email : "")
	const [site, setSite] = useState("")
	const [requests, setRequests] = useState("")
	const [loading, setLoading] = useState(false)
	const formRef = useRef(null)
	
	const onSubmit = async (event) => {
		event.preventDefault()
		if(loading) return
		setLoading(true)
		const sent = await upgradeAction(email, site, requests)
		setLoading(false)
		const message = sent === true ?
			"The request has been successfully sent. We will get back to you shortly." :
			"Unable to send the request. Please try again later."
		alert(message)
		setLoading(false)
		if(sent === true) {
			formRef.current.reset()
		}
		
	}
	
	return (
		<div className="px-6 py-5">
			<p className="text-base text-gray-300 mb-4">Please review your data to request an upgrade.</p>
			<form method="POST" className="flex flex-col gap-4" onSubmit={onSubmit} ref={formRef}>
				<div className="grid grid-cols-2 gap-x-6 gap-y-4">
					<Input
						placeholder="Your email address"
						onChange={setEmail}
						loading={loading}
						value={email}
						label="Email"
						type="email"
						name="email"
					/>
					<Input
						placeholder="Your site"
						onChange={setSite}
						label="Your site"
						loading={loading}
						value={site}
						name="site"
						type="url"
					/>
					<Input
						placeholder="Estimated number of requests"
						label="Number of monthly requests"
						onChange={setRequests}
						loading={loading}
						value={requests}
						name="requests"
						type="number"
					/>
				</div>
				<div>
					<button
						className={clsx(
							"rounded-md px-5 py-3 font-semibold transition-all border-2 relative",
							"focus-visible:outline-2 focus-visible:outline-offset-2",
							"border-blue-600 text-blue-600 focus-visible:outline-blue-600",
							!loading && "hover:text-white hover:bg-blue-600 cursor-pointer",
							"text-sm"
						)}
						type="submit"
					>
						<span className={clsx("transition-all", loading && "opacity-0")}>Submit</span>
						<div className="absolute inset-0 flex justify-center items-center">
							{loading && <Loader className="size-6 text-blue-500" />}
						</div>
					</button>
				</div>
			</form>
		</div>
	)
}