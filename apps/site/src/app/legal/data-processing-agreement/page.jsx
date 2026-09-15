import Header from "@/components/Header"
import Footer from "@/components/Footer"

import "../../styles/legal.css"

export const metadata = {
	title: "Data Processing Agreement | Gatekeepr",
	alternates: {
		canonical: "/legal/data-processing-agreement",
	}
}

export default function DataProcessingAgreement() {
	return (
		<div className="bg-gray-950">
			<Header />
			<div className="legal">
				<div className="px-4 lg:px-6 mx-auto max-w-4xl text-gray-300">
					<h1>Data Processing Agreement</h1>
					<div className="flex flex-col gap-6">
						<section className="text-center italic">
							<p>Version 1.0 (August 23, 2025)</p>
						</section>
						<section>
							<p>
								This Data Processing Agreement (<strong>Agreement</strong>) forms part of the main
								service agreement (<strong>Principal Agreement</strong>) between you{" "}
								(<strong>Client</strong>) and SLAVA UA SRL (<strong>Provider</strong>) for the use of
								the Gatekeepr service.
							</p>
						</section>
						<section>
							<h2>1. Parties</h2>
							<p>
								<strong>Provider</strong><br />
								SLAVA UA SRL<br />
								Valea Garboului 10, sc. 1, et. 5, ap. 28, Floresti, Cluj<br />
								CIF 48584613<br />
								Represented by: Yelyzaveta Polova<br />
								Email: hello@gatekeepr.io<br />
								Role: Processor
							</p>
							<p>
								<strong>Client</strong><br />
								The natural or legal person who uses Gatekeepr&apos;s services.<br />
								Role: Controller
							</p>
						</section>
						<section>
							<h2>2. Purpose of this Agreement</h2>
							<p>
								This Agreement sets out how the Provider processes personal data on behalf of the
								Client.
							</p>
							<p>
								The Provider only processes data to deliver the Gatekeepr service, which helps prevent
								platform abuse by checking email, IP address, domain, and user agent signals.
							</p>
							<p>
								Both parties agree to respect applicable data protection laws, especially the General
								Data Protection Regulation (EU) 2016/679 (<strong>GDPR</strong>).
							</p>
						</section>
						<section>
							<h2>3. Key Terms</h2>
							<ol className="list-decimal ml-4">
								<li>
									<strong>Client Personal Data</strong> means any personal data that the Provider
									processes on behalf of the Client.
								</li>
								<li>
									<strong>Processing</strong> means any operation performed on personal data, such as
									collection, storage, analysis, or deletion.
								</li>
								<li>
									<strong>Services</strong> means the Gatekeepr platform and related tools.
								</li>
								<li>
									<strong>Subprocessor</strong> means a third party engaged by the Provider to help
									deliver the Services.
								</li>
							</ol>
							<p>All terms not defined here carry the same meaning as in the GDPR.</p>
						</section>
						<section>
							<h2>4. Roles and Responsibilities</h2>
							<ol className="list-decimal ml-4">
								<li>
									The Client acts as the Controller and decides how and why personal data is
									processed.
								</li>
								<li>
									The Provider acts as the Processor and only processes personal data as instructed by
									the Client.
								</li>
								<li>
									The Provider will not use Client Personal Data for its own purposes.
								</li>
							</ol>
						</section>
						<section>
							<h2>5. Data Processing Details</h2>
							<p>
								<strong>Types of data processed</strong>: Email addresses, IP addresses, domain names,
								and user agent information.
							</p>
							<p>
								<strong>Data subjects</strong>: Users of the Client&apos;s platform (such as customers,
								visitors, or leads).
							</p>
							<p>
								<strong>Purpose</strong>: To check and protect against spam, abuse, and fraudulent
								activity.
							</p>
							<p>
								<strong>Retention</strong>: Provider processes data in real time and does not retain it
								longer than needed to provide the Services.
							</p>
						</section>
						<section>
							<h2>6. Provider Obligations</h2>
							<p>The Provider agrees to:</p>
							<ol className="list-decimal ml-4">
								<li>
									Only process Client Personal Data according to documented instructions from the
									Client.
								</li>
								<li>Keep Client Personal Data confidential.</li>
								<li>
									Implement suitable technical and organizational measures to protect personal data
									against loss, misuse, unauthorized access, or disclosure.
								</li>
								<li>
									Help the Client meet GDPR obligations regarding data subject rights, data breaches,
									and data protection impact assessments.
								</li>
								<li>Inform the Client if an instruction violates GDPR or other applicable laws.</li>
							</ol>
						</section>
						<section>
							<h2>7. Subprocessors</h2>
							<p>The Provider uses trusted partners (Subprocessors) to deliver the Services.</p>
							<p>The Client authorizes the Provider to use the following Subprocessors:</p>
							<p>
								<strong>1. Hetzner Online GmbH</strong><br />
								Address: Industriestr. 25, 91710 Gunzenhausen, Germany<br />
								Website: hetzner.com<br />
								Data Location: Frankfurt, Germany<br />
								Purpose: Infrastructure<br />
								Data Processed: Email, IP, User Agent
							</p>
							<p>
								<strong>2. Cloudflare Inc.</strong><br />
								Address: 101 Townsend St, San Francisco, CA 94107, USA<br />
								Website: cloudflare.com<br />
								Data Location: European Economic Area<br />
								Purpose: DDoS protection<br />
								Data Processed: Traffic data
							</p>
							<p>
								The Provider will notify the Client of any intended changes to Subprocessors and give
								the Client the opportunity to object.
							</p>
						</section>
						<section>
							<h2>8. International Transfers</h2>
							<p>
								The Provider ensures that if Client Personal Data is transferred outside the EEA,
								appropriate safeguards are in place (such as Standard Contractual Clauses) to protect
								the data.
							</p>
						</section>
						<section>
							<h2>9. Data Breaches</h2>
							<p>
								If the Provider becomes aware of a personal data breach affecting Client Personal Data,
								it will notify the Client without undue delay and provide information to support the
								Client in meeting its legal obligations.
							</p>
						</section>
						<section>
							<h2>10. End of Processing</h2>
							<p>
								When the Principal Agreement ends, the Provider will delete or return all Client
								Personal Data, unless legal obligations require storage.
							</p>
						</section>
						<section>
							<h2>11. Liability</h2>
							<p>
								Each party is responsible for complying with its own obligations under GDPR and this
								Agreement.
							</p>
						</section>
						<section>
							<h2>12. Governing Law</h2>
							<p>
								This Agreement is governed by the laws of Romania. Any disputes will be resolved by the
								courts of Cluj, Romania.
							</p>
						</section>
					</div>
				</div>
			</div>
			<Footer withBorder={true} />
		</div>
	)
}
