import Link from "next/link"
import { ArrowUpRightIcon } from "@heroicons/react/24/solid"

import Header from "@/components/Header"
import Footer from "@/components/Footer"

import { getPostsByCategory } from "@/libs/blog"
import { isUserLoggedIn } from "@/libs/user"

export const dynamic = "force-dynamic"

export const metadata = {
	title: "Integrate Signup Abuse Protection Into Your App",
	description: "Add Gatekeepr to Supabase, Better Auth, Next.js, and other signup flows with lightweight integrations that block disposable emails, bots, and repeat trial abuse before account creation.",
	alternates: {
		canonical: "/integrations",
	},
}

function getIntegrationName(post) {
	const title = post.title || ""
	return title
		.replace(/^Protecting\s+/i, "")
		.replace(/\s+with Gatekeepr$/i, "")
		.replace(/\s+Signups$/i, "")
		.trim()
}

function getFrameworkInitials(name) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase()
}

export default async function IntegrationsPage() {
	const [session, posts] = await Promise.all([
		isUserLoggedIn(),
		getPostsByCategory("integrations"),
	])

	return (
		<div className="min-h-screen bg-gray-950 text-white">
			<Header session={session} />
			<main className="pb-20">
				<section className="relative isolate overflow-hidden border-b border-white/8 pt-20 sm:pt-24">
					<div className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(180deg,#08111f_0%,#07101b_48%,#030712_100%)]" />
					<div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] opacity-35" />
					<div className="mx-auto max-w-7xl px-6 pb-14 pt-10 sm:pb-16 lg:px-8">
						<div className="max-w-4xl">
							<p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-400">
								Integrations
							</p>
							<h1 className="mt-5 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
								Integrate Signup Abuse Protection Into Your App
							</h1>
							<p className="mt-7 max-w-3xl text-lg/8 font-medium text-gray-300 sm:text-xl/9">
								Add Gatekeepr to Supabase, Better Auth, Next.js, and other signup flows with lightweight integrations that block disposable emails, bots, and repeat trial abuse before account creation.
							</p>
						</div>
					</div>
				</section>

				<section className="mx-auto max-w-7xl px-6 pt-12 lg:px-8">
					{posts.length > 0 ? (
						<div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
							{posts.map((post) => {
								const integrationName = getIntegrationName(post)

								return (
									<article
										key={post.id}
										className="group relative min-h-72 rounded-lg border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-blue-400/45 hover:bg-white/[0.055] sm:p-7"
									>
										<Link href={`/blog/${post.slug}`} className="absolute inset-0 z-10">
											<span className="sr-only">Read {post.title}</span>
										</Link>
										<div className="flex h-full flex-col">
											<div className="flex items-start justify-between gap-5">
												<div className="flex items-center gap-4">
													<div className="grid size-14 place-items-center rounded-lg border border-white/10 bg-gray-900 text-base font-semibold tracking-tight text-blue-200">
														{getFrameworkInitials(integrationName)}
													</div>
													<h2 className="text-2xl font-semibold tracking-tight text-white">
														{integrationName}
													</h2>
												</div>
												<span className="relative z-0 inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-white/10 text-gray-300 transition-all group-hover:border-blue-400/50 group-hover:text-blue-300">
													<ArrowUpRightIcon className="size-4" />
												</span>
											</div>
											<p className="mt-5 line-clamp-3 text-sm/6 text-gray-400">
												{post.description}
											</p>
											<div className="mt-auto pt-7 text-sm font-semibold text-blue-300">
												Read integration guide
											</div>
										</div>
									</article>
								)
							})}
						</div>
					) : (
						<div className="border border-white/10 bg-white/[0.03] p-8">
							<h2 className="text-2xl font-semibold text-white">No integration guides are published yet.</h2>
							<p className="mt-3 max-w-2xl text-sm/6 text-gray-400">
								Published posts in the Integrations category will appear here automatically.
							</p>
						</div>
					)}
				</section>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
