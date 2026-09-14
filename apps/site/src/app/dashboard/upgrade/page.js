import { redirect } from "next/navigation"

import UpgradeForm from "@/components/Dashboard/UpgradeForm"
import DashboardLayout from "@/components/Dashboard/Layout"
import Widget from "@/components/Dashboard/Widget"

import { findUserById, isUserLoggedIn } from "@/libs/user"

export const metadata = {
	title: "Upgrade | Gatekeepr"
}

export default async function UpgradePage() {
	const session = await isUserLoggedIn()
	if(!session) return redirect("/get-free-api-key")
	const { user } = session
	return (
		<DashboardLayout>
			<div className="mx-auto max-w-2xl">
				<div className="flex flex-col gap-4 sm:gap-6">
					<Widget title="Request an Upgrade">
						<UpgradeForm user={user} />
					</Widget>
				</div>
			</div>
		</DashboardLayout>
	)
}
