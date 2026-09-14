import { notFound } from "next/navigation"
import Image from "next/image"
import clsx from "clsx"
import Link from "next/link"

import Header from "@/components/Header"
import Footer from "@/components/Footer"
import ResearchTableOfContents from "@/components/ResearchTableOfContents"
import BlogPostContent from "@/components/BlogPostContent"

import { isUserLoggedIn } from "@/libs/user"
import { getPost } from "@/libs/blog"
import { getBlogImage } from "@/libs/blog-images"

export const dynamic = "force-dynamic"

export const generateMetadata = async ({ params }) => {
	const { slug } = await params
	const post = await getPost(slug)
	if(!post) return { title: "Not Found | Gatekeepr" }
	return {
		title: `${post.title} | Gatekeepr`,
		description: post.seoDescription || post.description,
		alternates: {
			canonical: `/blog/${post.slug}`,
		}
	}
}

export default async function BlogPost({ params }) {
	const { slug } = await params
	const post = await getPost(slug)
	if(!post) return notFound()
	const session = await isUserLoggedIn()
	const tableOfContents = post.tableOfContents || []

	return (
		<div className="bg-gray-950 text-white">
			<Header session={session} />
			<main className="pb-20">
				<section className="relative isolate overflow-hidden border-b border-white/5 pt-20 sm:pt-24">
					<div className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(180deg,#081120_0%,#050c18_52%,#030712_100%)]" />
					<div className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-full bg-[radial-gradient(circle_at_18%_26%,rgba(59,130,246,0.18),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(99,102,241,0.12),transparent_20%)]" />
					<div className="mx-auto max-w-7xl px-6 pb-14 sm:pb-16 lg:px-8">
						<div className="max-w-6xl py-8 sm:py-12">
							<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-400">
								<time dateTime={post.datetime}>{post.date}</time>
								{post.category ? (
									<Link
										href={`/blog/category/${post.category}`}
										className={clsx(
											"relative z-10 rounded-full px-3 py-1.5 font-medium bg-gray-800/60 text-gray-300",
											"hover:bg-gray-700/70 hover:text-white"
										)}
									>
										{post.categoryName}
									</Link>
								) : null}
							</div>
							<h1 className="mt-5 max-w-[72rem] text-5xl font-bold tracking-tight text-balance text-white sm:text-6xl lg:text-7xl">
								{post.title}
							</h1>
							<p className="mt-7 max-w-3xl text-lg/8 font-medium text-pretty text-gray-300 sm:text-xl/9">
								{post.description}
							</p>
							{getBlogImage(post) ? (
								<Image
									src={getBlogImage(post)}
									alt={post.imageAlt || ""}
									className="mt-10 aspect-video w-full rounded-[1.75rem] object-cover sm:mt-12"
									sizes="(min-width: 1024px) 72rem, 100vw"
									priority
								/>
							) : null}
						</div>
					</div>
				</section>

				<div className="px-6 pt-12 lg:px-8">
					<div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[18rem_minmax(0,48rem)]">
						{tableOfContents.length > 0 ? (
							<aside className="hidden lg:block">
								<ResearchTableOfContents items={tableOfContents} />
							</aside>
						) : null}

						<div className="min-w-0">
							<div className="mx-auto max-w-3xl lg:mx-0">
								<BlogPostContent content={post.content} />
							</div>
						</div>
					</div>
				</div>
			</main>
			<Footer withBorder={true} />
		</div>
	)
}
