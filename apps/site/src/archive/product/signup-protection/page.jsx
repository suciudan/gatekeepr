import Footer from "@/components/Footer"
import Header from "@/components/Header"
import { isUserLoggedIn } from "@/libs/user"

import "./signup-protection.css"
import SignupProtectionClient from "./SignupProtectionClient"

export const metadata = {
	title: "Signup Fraud Prevention for SaaS | Gatekeepr",
	description: "Stop fake accounts, disposable emails, bots, and repeat signups before they reach your product. Gatekeepr protects signup flows with a simple API and clear allow, challenge, or block decisions.",
	alternates: {
		canonical: "/product/signup-protection",
	},
}

export default async function SignupProtectionPage() {
	const session = await isUserLoggedIn()

	return (
		<div className="bg-gray-950 text-white">
			<Header session={session} />
			<main>
				<div className="signup-protection-page">
					<SignupProtectionClient primaryHref={session ? "/dashboard" : "/get-free-api-key"} />
				</div>
			</main>
			<Footer />
		</div>
	)
}
