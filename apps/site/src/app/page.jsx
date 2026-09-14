import { headers } from "next/headers"

import HowItWorks from "@/components/HowItWorks"
import Features from "@/components/Features"
import Header from "@/components/Header"
import Footer from "@/components/Footer"
import Hero from "@/components/Hero"
import InvisibleDrain from "@/components/InvisibleDrain"
import Pricing from "@/components/Pricing"
import UseCases from "@/components/UseCases"
import FAQ from "@/components/FAQ"
import CTA from "@/components/CTA"

import { isUserLoggedIn } from "@/libs/user"

export const metadata = {
	title: "Gatekeepr | Stop Free-Trial Abuse at Signup",
	alternates: {
		canonical: "/"
	}
}

export default async function Home() {
	const h = await headers()
	const session = await isUserLoggedIn()
	return (
		<div className="bg-gray-950">
			<Header session={session} />
			<Hero
				title="Stop Free-Trial Abuse at Signup."
				subtitle={<>
					Block disposable emails, bots, and repeat trial abusers before they reach your product. Gatekeepr
					analyzes email, IP, and user agent and returns a clear decision: <br />
					<strong className="text-white">allow</strong>, <strong className="text-white">challenge</strong>, or <strong className="text-white">block</strong>.
				</>
				}
				/*desc="Detects 70,000+ disposable email domains in real time."*/
				ip={h.get("x-client-ip")}
			/>
			<InvisibleDrain />
			<HowItWorks />
			<Features />
			<UseCases />
			<Pricing />
			<CTA />
			<FAQ />
			<Footer />
		</div>
	)
}
