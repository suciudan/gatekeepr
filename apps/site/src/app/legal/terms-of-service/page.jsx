import Header from "@/components/Header"
import Footer from "@/components/Footer"

import "../../styles/legal.css"

export const metadata = {
	title: "Terms of Service | Gatekeepr",
	alternates: {
		canonical: "/legal/terms-of-service",
	}
}

export default function TermsOfService() {
	return (
		<div className="bg-gray-950">
			<Header />
			<div className="legal">
				<div className="px-4 lg:px-6 mx-auto max-w-4xl text-gray-300">
					<h1>Terms of Service</h1>
					<div className="flex flex-col gap-6">
						<section className="text-center italic">
							<p>Version 1.1 (October 10, 2025)</p>
						</section>
						<section>
							<h2>1. Who We Are</h2>
							<p>This service is operated by SLAVA UA SRL, a Romanian company registered under CIF 48584613.</p>
						</section>
						<section>
							<h2>2. What Data We Collect</h2>
							<p>We receive the following information from you in each request:</p>
							<ul>
								<li><strong>Email</strong> (mandatory)</li>
								<li><strong>IP Address</strong> (optional)</li>
								<li><strong>User Agent</strong> (optional)</li>
							</ul>
						</section>
						<section>
							<h2>3. How We Handle Your Data</h2>
							<ul>
								<li>We <strong>do not store</strong> any of the information you send us.</li>
								<li>
									The data is <strong>processed in-memory</strong>, a response is generated, and then
									the data is <strong>immediately discarded</strong>.
								</li>
								<li>
									There is <strong>no logging</strong>, <strong>no tracking</strong>, and{" "}
									<strong>no retention</strong>.
								</li>
								<li>
									Your data does <strong>not leave our servers</strong>, and we do{" "}
									<strong>not share or sell</strong> any of it.
								</li>
								<li>
									There are <strong>no third parties involved in processing</strong> of the email
									address.
								</li>
							</ul>
						</section>
						<section>
							<h2>4. Infrastructure</h2>
							<p>
								Our systems are hosted in Germany, using{" "}
								<a
									className="text-blue-600 underline hover:no-underline font-semibold"
									href="https://www.hetzner.com/"
									target="_blank"
									rel="noopener noreferrer">Hetzner</a>
								{" "}as our infrastructure
								provider.
							</p>
						</section>
						<section>
							<h2>5. Rate Limits & Fair Use</h2>
							<ul>
								<li>
									Our fair usage policy allows for <strong>1,000 requests per month</strong>, with a
									maximum of <strong>1 request per second</strong>. You can increase these limits by
									purchasing a subscription.
								</li>
								<li>
									If you need higher throughput, just <strong>reach out</strong>. We're happy to talk.
								</li>
								<li>
									We monitor for abuse, and we will block users or systems sending unreasonable
									volumes of traffic.
								</li>
							</ul>
						</section>
						<section>
							<h2>6. Abuse and Ban Policy</h2>
							<p>
								If we detect behavior that looks like system abuse, botnets, or excessive load, we
								reserve the right to:
							</p>
							<ul>
								<li>
									<strong>Throttle</strong>, <strong>rate-limit</strong>, or
									<strong>temporarily block traffic</strong>
								</li>
								<li>
									<strong>Permanently ban</strong> abusive actors without prior notice
								</li>
							</ul>
						</section>
						<section>
							<h2>7. Cookies</h2>
							<ul>
								<li>
									We use cookies strictly for <strong>authentication purposes</strong>, to keep you
									logged in and maintain session continuity.
								</li>
								<li>
									We <strong>do not use cookies for tracking, advertising, or analytics</strong>.
								</li>
								<li>
									<strong>No third-party cookies</strong> are set on our site.
								</li>
								<li>
									All cookies are <strong>first-party</strong>, limited in scope, and essential to the
									functioning of the service.
								</li>
								<li>
									If you disable cookies, you may not be able to log in or use parts of the service
									that require authentication.
								</li>
							</ul>
						</section>
						<section>
							<h2>8. Analytics</h2>
							<p>
								We use a self-hosted version of{" "}
								<a
									className="text-blue-600 underline hover:no-underline font-semibold"
									href="https://plausible.io/"
									target="_blank"
									rel="noopener noreferrer"
								>
									Plausible Analytics
								</a> to understand how users interact with our website and from where they are coming.
								Plausible is a privacy-focused analytics tool that does not use cookies or collect
								personally identifiable information.
							</p>
							<p>
								All collected data is stored securely on our servers located in{" "}
								<strong>Germany</strong> and is not shared with any third parties. This data is used
								solely to improve the performance, usability, and experience of our website and
								services.
							</p>
						</section>
					</div>
				</div>
			</div>
			<Footer withBorder={true} />
		</div>
	)
}
