import { redirect } from "next/navigation"
import Link from "next/link"
import clsx from "clsx"

import VerifyEmailForm from "@/components/Auth/VerifyEmailForm"
import { Logo } from "@/components/Logo"

import { isUserLoggedIn } from "@/libs/user"

export const metadata = {
	title: "Verify Your Email | Gatekeepr",
	alternates: {
		canonical: `/verify-email`,
	}
}

export default async function VerifyEmail() {
	const session = await isUserLoggedIn()
	if(session) return redirect("/dashboard")
	return (
		<div className="bg-gray-950">
			<div className="flex flex-col gap-6 items-center justify-center sm:px-6 py-8 mx-auto md:h-screen lg:py-0">
				<Link href="/" className="inline-flex mb-4">
					<Logo className="h-14 text-blue-600" />
				</Link>
				<h1 className={clsx(
					"text-xl font-bold leading-tight tracking-tight md:text-2xl text-white",
					"text-center"
				)}>
					Verify Your Email
				</h1>
				<div
					className="w-full sm:rounded-lg border-2 border-x-0 sm:border-x-2 md:mt-0 sm:max-w-md xl:p-0 bg-slate-950 border-slate-800">
					<div className="p-6 sm:p-8">
						<VerifyEmailForm />
					</div>
				</div>
			</div>
		</div>
	)
}
//