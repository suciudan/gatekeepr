"use client"

import clsx from "clsx"
import { useState } from "react"

const tabs = [
	{ id: "request", label: "Request" },
	{ id: "response", label: "Response" },
]

function HighlightedResponse({ code }) {
	return code.split("\n").map((line, index) => {
		if(line.includes("\"status\"")) {
			return (
				<div key={index}>
					<span className="text-gray-500">  </span>
					<span className="text-blue-300">"status"</span>
					<span className="text-gray-500">: </span>
					<span className="text-amber-300">"challenge"</span>
					<span className="text-gray-500">,</span>
				</div>
			)
		}

		if(line.includes("\"disposable_email\"") || line.includes("\"datacenter_ip\"")) {
			return (
				<div key={index}>
					<span className="text-gray-500">    </span>
					<span className="text-rose-300">{line.trim().replace(/,$/, "")}</span>
					{line.trim().endsWith(",") && <span className="text-gray-500">,</span>}
				</div>
			)
		}

		if(line.includes("\"valid_email_syntax\"")) {
			return (
				<div key={index}>
					<span className="text-gray-500">    </span>
					<span className="text-emerald-300">"valid_email_syntax"</span>
				</div>
			)
		}

		if(line.includes("\"known_disposable_provider\"")) {
			return (
				<div key={index}>
					<span className="text-gray-500">    </span>
					<span className="text-rose-300">"known_disposable_provider"</span>
				</div>
			)
		}

		if(line.includes("\"recommended_action\"")) {
			return (
				<div key={index}>
					<span className="text-gray-500">    </span>
					<span className="text-blue-300">"recommended_action"</span>
					<span className="text-gray-500">: </span>
					<span className="text-amber-300">"require_email_verification"</span>
				</div>
			)
		}

		return (
			<div key={index} className="text-gray-400">
				{line}
			</div>
		)
	})
}

export default function ApiTabs({ requestCode, responseCode }) {
	const [activeTab, setActiveTab] = useState("request")

	return (
		<div>
			<div className="mb-3 flex gap-2">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setActiveTab(tab.id)}
						className={clsx(
							"cursor-pointer rounded-full border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.24em] transition-all",
							activeTab === tab.id
								? "border-blue-500/30 bg-blue-500/10 text-blue-200"
								: "border-transparent bg-white/[0.03] text-gray-400 hover:border-white/10 hover:text-gray-100"
						)}
					>
						{tab.label}
					</button>
				))}
			</div>

			<div className="overflow-hidden rounded-[1.5rem] border border-[#1a2744]/60 bg-[#060a14] shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
				<div className="flex items-center gap-2 border-b border-[#1a2744]/60 bg-[#0a0f1c] px-5 py-3">
					<div className="flex gap-1.5">
						<div className="h-2.5 w-2.5 rounded-full bg-rose-400/55" />
						<div className="h-2.5 w-2.5 rounded-full bg-amber-400/55" />
						<div className="h-2.5 w-2.5 rounded-full bg-emerald-400/55" />
					</div>
					<span className="ml-2 font-mono text-xs uppercase tracking-[0.28em] text-gray-500">
						{activeTab === "request" ? "POST /v1/signup/check" : "Gatekeepr response"}
					</span>
				</div>

				<pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-7 text-gray-400">
					<code>
						{activeTab === "request" ? requestCode : <HighlightedResponse code={responseCode} />}
					</code>
				</pre>
			</div>
		</div>
	)
}
