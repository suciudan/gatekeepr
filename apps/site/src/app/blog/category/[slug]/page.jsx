import Link from "next/link"
import Image from "next/image"
import clsx from "clsx"
import { notFound } from "next/navigation"

import Header from "@/components/Header"
import Footer from "@/components/Footer"

import { isUserLoggedIn } from "@/libs/user"
import { getBlogCategories, getPostsByCategory } from "@/libs/blog"
import { getBlogImage } from "@/libs/blog-images"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }) {
	const { slug } = await params
	const categories = await getBlogCategories()
	const category = categories.find((entry) => entry.slug === slug)

	if(!category) return { title: "Not Found | Gatekeepr" }

	return {
		title: `${category.name} Articles | Gatekeepr`,
		alternates: {
			canonical: `/blog/category/${category.slug}`,
		},
	}
}

export default async function BlogCategoryPage({ params }) {
	const { slug } = await params
	const categories = await getBlogCategories()
	const category = categories.find((entry) => entry.slug === slug)
	if(!category) return notFound()

	const session = await isUserLoggedIn()
	const posts = await getPostsByCategory(category.slug)

	return (
		<div className="bg-gray-950 text-white">
			<Header session={session} />
			<main className="pb-20">
				<section className="relative isolate overflow-hidden border-b border-white/5 pt-20 sm:pt-24">
					<div className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(180deg,#081120_0%,#050c18_52%,#030712_100%)]" />
					<div className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-full bg-[radial-gradient(circle_at_18%_26%,rgba(59,130,246,0.18),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(99,102,241,0.12),transparent_20%)]" />
					<div className="mx-auto max-w-7xl px-6 pb-14 sm:pb-16 lg:px-8">
						<div className="max-w-5xl py-8 sm:py-12">
							<p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-500">
								Blog category
							</p>
							<h1 className="mt-4 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
								{category.name}
							</h1>
							<p className="mt-7 max-w-4xl text-lg/8 font-medium text-pretty text-gray-300 sm:text-xl/9">
								Browse all Gatekeepr blog posts filed under {category.name}.
							</p>
						</div>
					</div>
				</section>

				<div className="mx-auto max-w-7xl px-6 lg:px-8">
					{categories.length > 0 ? (
						<nav aria-label="Blog categories" className="mt-12 flex flex-wrap gap-3">
							{categories.map((entry) => {
								const isActive = entry.slug === category.slug

								return (
									<Link
										key={entry.slug}
										href={`/blog/category/${entry.slug}`}
										aria-current={isActive ? "page" : undefined}
										className={clsx(
											"rounded-full border px-4 py-2 text-sm font-semibold",
											isActive
												? "border-blue-400/50 bg-blue-500/15 text-white"
												: "border-white/10 bg-white/5 text-gray-200 hover:border-blue-400/40 hover:bg-blue-500/10 hover:text-white"
										)}
									>
										{entry.name}
									</Link>
								)
							})}
						</nav>
					) : null}
					<div className={clsx(
						"grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-20",
						"mx-auto max-w-2xl lg:mx-0 lg:max-w-none",
						categories.length > 0 ? "mt-8" : "mt-12"
					)}>
						{posts.map((post) => (
							<article key={post.id} className="flex flex-col items-start justify-between">
								{getBlogImage(post) ? (
									<Link
										className="relative block w-full hover:opacity-60"
										href={`/blog/${post.slug}`}
									>
										<Image
											src={getBlogImage(post)}
											alt={post.imageAlt || ""}
											className="aspect-video w-full rounded-2xl border border-white/10 object-cover"
											sizes="(min-width: 1024px) 33vw, (min-width: 640px) 42rem, 100vw"
										/>
									</Link>
								) : null}
								<div className="flex max-w-xl grow flex-col justify-between">
									<div className="mt-8 flex items-center gap-x-4 text-xs">
										<time dateTime={post.datetime} className="text-gray-400">
											{post.date}
										</time>
										{post.category ? (
											<Link
												href={`/blog/category/${post.category}`}
												className="relative z-10 rounded-full bg-gray-800/60 px-3 py-1.5 font-medium text-gray-300 hover:bg-gray-700/70 hover:text-white"
											>
												{post.categoryName}
											</Link>
										) : null}
									</div>
									<div className="group relative grow">
										<h2 className="mt-3 text-lg/6 font-semibold text-white group-hover:text-gray-300">
											<Link href={`/blog/${post.slug}`}>
												<span className="absolute inset-0" />
												{post.title}
											</Link>
										</h2>
										<p className="mt-5 line-clamp-3 text-sm/6 text-gray-400">{post.description}</p>
									</div>
								</div>
							</article>
						))}
					</div>
				</div>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
