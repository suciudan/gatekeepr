import { redirect } from "next/navigation"
import Link from "next/link"
import clsx from "clsx"

import { getUsage } from "@repo/core/usage"

import DashboardLayout from "@/components/Dashboard/Layout"
import Widget from "@/components/Dashboard/Widget"
import Copy from "@/components/Dashboard/Copy"
import Alert from "@/components/Alert"

import { statLabels } from "@/config/statLabels"
import { isUserLoggedIn } from "@/libs/user"

export const metadata = {
	title: "Dashboard | Gatekeepr"
}

export default async function DashboardPage() {
	const session = await isUserLoggedIn()
	if(!session) return redirect("/get-free-api-key")
	const { user } = session
	const usage = await getUsage(user.apiKey)
	return (
		<DashboardLayout title="Dashboard">
			<div className="mx-auto max-w-2xl">
				<div className="flex flex-col gap-4 sm:gap-6">
					<Alert className="flex flex-col sm:flex-row justify-between gap-2 sm:items-center">
						<span>You have <strong>{usage.LFT}</strong> requests remaining in your package.</span>
						<span className="sm:border-l-2 sm:pl-4">
								<Link
									className={clsx(
										"hover:text-white transition-all underline hover:no-underline",
									)}
									href="/dashboard/upgrade"
								>Upgrade</Link>
							</span>
					</Alert>
					<Widget title="API Key">
						<div className="px-4 py-5">
							<Copy>{user.apiKey}</Copy>
						</div>
					</Widget>
					<Widget title="Usage">
						<div className="grid grid-cols-1 gap-px bg-slate-800 sm:grid-cols-3">
							{statLabels.map((stat) => (
								<div key={stat} className="bg-slate-950 px-4 py-3 sm:px-6">
									<p className="text-sm/6 font-medium text-gray-400">{stat}</p>
									<p className="mt-2 flex items-baseline gap-x-2">
										<span className="text-2xl font-semibold tracking-tight text-white">{usage[stat]}</span>
									</p>
								</div>
							))}
						</div>
					</Widget>
				</div>
			</div>
		</DashboardLayout>
	)
}
