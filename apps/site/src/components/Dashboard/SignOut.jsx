"use client"

import { ArrowLeftStartOnRectangleIcon } from "@heroicons/react/24/solid"
import { useRouter } from "next/navigation"
import clsx from "clsx"

import { authClient } from "@/libs/auth-client"

export default function SignOut() {
	
	const router = useRouter()
	
	const onClick = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					router.push("/sign-in");
				},
			},
		})
	}
	
	return (
		<div
			className={clsx(
				"flex items-center gap-2 text-blue-600 hover:text-blue-400 transition-all cursor-pointer",
				"text-sm font-semibold"
			)}
			onClick={onClick}
		>
			<ArrowLeftStartOnRectangleIcon className="size-6" />
			Sign Out
		</div>
	)
}