"use client"

import {
	ArrowRightIcon,
	Bars3Icon,
	ChevronDownIcon,
	XMarkIcon,
} from "@heroicons/react/24/solid"
import {
	Dialog,
	DialogPanel,
	Disclosure,
	DisclosureButton,
	DisclosurePanel,
	Popover,
	PopoverButton,
	PopoverPanel,
} from "@headlessui/react"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import clsx from "clsx"

import { Logo } from "@/components/Logo"

const navigation = [
	{
		name: "Product",
		items: [
			{ name: "Features", href: "/#features" },
			{ name: "FAQ", href: "/#faq" },
		],
	},
	{
		name: "Tools",
		items: [
			{ name: "Disposable Email Checker", href: "/disposable-email-checker" },
			{ name: "Disposable Email Data", href: "/disposable-email-data" },
		]
	},
	{ name: "Integrations", href: "/integrations" },
	{ name: "Blog", href: "/blog" },
	{ name: "Docs", href: "https://docs.gatekeepr.io" },
	/*{
		name: "Product",
		items: [
			{ name: "Signup Protection", href: "/product/signup-protection" },
			{ name: "Email Intelligence", href: "/product/email-intelligence" },
			{ name: "Fraud Scoring", href: "/product/free-trial-abuse-prevention" },
		],
	},
	{
		name: "Tools",
		items: [
			{ name: "Disposable Domain Detector", href: "/tools/disposable-domain-detector" },
			{ name: "Email Verifier", href: "/tools/email-verifier" },
		],
	},
	{
		name: "Resources",
		items: [
			{ name: "Docs", href: "https://docs.gatekeepr.io" },
			{ name: "Guides", href: "/guides" },
			{ name: "Blog", href: "/blog" },
		],
	},
	{
		name: "Company",
		items: [
			{ name: "About", href: "/about" },
			{ name: "Security", href: "/security" },
			{ name: "Privacy", href: "/privacy" },
			{ name: "Status", href: "https://status.gatekeepr.io/" },
		],
	},
	*/
	{ name: "Contact", href: "mailto:hello@gatekeepr.io?subject=Gatekeepr%20contact" },
]

function isExternalLink(href) {
	return href.startsWith("https://") || href.startsWith("mailto:")
}

function linkProps(href) {
	if(!isExternalLink(href)) return {}

	return {
		rel: "noopener noreferrer",
		target: href.startsWith("https://") ? "_blank" : "_self",
	}
}

export default function Header({ session }) {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const [isScrolled, setIsScrolled] = useState(false)
	const pathname = usePathname()

	const isActive = (path) => {
		if(path === "/") return pathname === "/"
		if(path.startsWith("/#")) return false
		return pathname === path || pathname.startsWith(`${path}/`)
	}

	const isGroupActive = (items) => items.some((item) => isActive(item.href))

	useEffect(() => {
		function onScroll() {
			setIsScrolled(window.scrollY > 0)
		}
		onScroll()
		window.addEventListener("scroll", onScroll, { passive: true })
		return () => {
			window.removeEventListener("scroll", onScroll, { passive: true })
		}
	}, [])

	return (
		<header
			className={clsx(
				"fixed top-0 z-20 w-full transition-all",
				isScrolled && "[@supports(backdrop-filter:blur(0))]:bg-gray-950/90"
			)}
		>
			<nav aria-label="Global" className="mx-auto flex max-w-7xl items-center justify-between gap-4 p-6 py-3 lg:px-8">
				<div className="flex flex-1 items-center gap-4 lg:gap-8">
					<Link href="/" className="-m-1.5 flex-none p-1.5">
						<span className="sr-only">Gatekeepr</span>
						<Logo className="fill-blue-600 size-10 sm:size-12" />
					</Link>
					<div className="hidden lg:flex lg:items-center lg:gap-x-8">
						{navigation.map((item) => (
							item.items ? (
								<Popover key={item.name} className="relative">
									{({ open }) => (
										<>
											<PopoverButton
												className={clsx(
													"inline-flex cursor-pointer items-center gap-1 text-sm/6 font-semibold transition-all outline-none",
													open || isGroupActive(item.items)
														? "text-blue-500"
														: "text-gray-200 hover:text-blue-600"
												)}
											>
												<span>{item.name}</span>
												<ChevronDownIcon
													aria-hidden="true"
													className={clsx("size-4 transition-transform", open && "rotate-180")}
												/>
											</PopoverButton>
											<PopoverPanel
												anchor={{ to: "bottom start", gap: 12 }}
												className="z-30 w-64 rounded-2xl border border-white/10 bg-gray-950/95 p-2 shadow-2xl shadow-black/30 backdrop-blur"
											>
												<div className="space-y-1">
													{item.items.map((subItem) => (
														<Link
															key={subItem.name}
															href={subItem.href}
															className={clsx(
																"block rounded-xl px-4 py-3 text-sm font-semibold transition-all",
																isActive(subItem.href)
																	? "bg-blue-600/15 text-blue-400"
																	: "text-gray-200 hover:bg-white/5 hover:text-blue-400"
															)}
															{...linkProps(subItem.href)}
														>
															{subItem.name}
														</Link>
													))}
												</div>
											</PopoverPanel>
										</>
									)}
								</Popover>
							) : (
								<Link
									key={item.name}
									href={item.href}
									className={clsx(
										"text-sm/6 font-semibold transition-all",
										isActive(item.href) ? "text-blue-500" : "text-gray-200 hover:text-blue-600"
									)}
									{...linkProps(item.href)}
								>
									{item.name}
								</Link>
							)
						))}
					</div>
				</div>
				<div className="flex items-center justify-end gap-3 sm:gap-6">
					<Link
						className={clsx(
							"inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm/6 font-semibold text-white transition-all",
							"bg-blue-600 hover:bg-blue-500"
						)}
						href={session ? "/dashboard" : "/get-free-api-key"}
					>
						{session ? (
							<>
								<span className="sm:hidden">Panel</span>
								<span className="hidden sm:inline">Dashboard</span>
							</>
						) : (
							<>
								<span>Start Free</span>
								<ArrowRightIcon className="hidden size-4 sm:inline" />
							</>
						)}
					</Link>
					{!session && (
						<Link
							className={clsx(
								"hidden text-sm/6 font-bold text-blue-600 hover:text-white sm:inline-flex"
							)}
							href="/sign-in"
						>
							Sign In
						</Link>
					)}
					<div className="flex lg:hidden">
						<button
							type="button"
							onClick={() => setMobileMenuOpen(true)}
							className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-200"
						>
							<span className="sr-only">Open main menu</span>
							<Bars3Icon aria-hidden="true" className="size-8" />
						</button>
					</div>
				</div>
			</nav>
			<Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
				<div className="fixed inset-0 z-10" />
				<DialogPanel className="fixed inset-y-0 left-0 z-20 w-full overflow-y-auto bg-gray-950 px-6 py-3">
					<div className="flex items-center justify-between gap-4">
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={() => setMobileMenuOpen(false)}
								className="-m-2.5 rounded-md p-2.5 text-gray-200"
							>
								<span className="sr-only">Close menu</span>
								<XMarkIcon aria-hidden="true" className="size-8" />
							</button>
							<Link href="/" className="-m-1.5 p-1.5" onClick={() => setMobileMenuOpen(false)}>
								<span className="sr-only">Gatekeepr</span>
								<Logo className="fill-blue-600 h-10 w-auto" />
							</Link>
						</div>
						<div className="flex justify-end">
							{!session && (
								<Link href="/sign-in" className="text-base font-semibold text-gray-200 sm:hidden">
									Sign In
								</Link>
							)}
						</div>
					</div>
					<div className="mt-6 space-y-2">
						{navigation.map((item) => (
							item.items ? (
								<Disclosure key={item.name} as="div" className="rounded-2xl border border-white/10 bg-white/3">
									{({ open }) => (
										<>
											<DisclosureButton
												className={clsx(
													"flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left text-base/7 font-semibold transition-all",
													isGroupActive(item.items) ? "text-blue-400" : "text-gray-100"
												)}
											>
												<span>{item.name}</span>
												<ChevronDownIcon
													aria-hidden="true"
													className={clsx("size-5 transition-transform", open && "rotate-180")}
												/>
											</DisclosureButton>
											<DisclosurePanel className="space-y-1 px-2 pb-2">
												{item.items.map((subItem) => (
													<Link
														key={subItem.name}
														href={subItem.href}
														className={clsx(
															"block rounded-xl px-4 py-3 text-sm font-semibold transition-all",
															isActive(subItem.href)
																? "bg-blue-600/15 text-blue-400"
																: "text-gray-300 hover:bg-white/5 hover:text-white"
														)}
														onClick={() => setMobileMenuOpen(false)}
														{...linkProps(subItem.href)}
													>
														{subItem.name}
													</Link>
												))}
											</DisclosurePanel>
										</>
									)}
								</Disclosure>
							) : (
								<Link
									key={item.name}
									href={item.href}
									className={clsx(
										"-mx-3 flex rounded-lg px-3 py-2 text-base/7 font-semibold",
										"justify-center",
										isActive(item.href)
											? "text-blue-400"
											: "text-gray-200 hover:text-blue-600"
									)}
									onClick={() => setMobileMenuOpen(false)}
									{...linkProps(item.href)}
								>
									{item.name}
								</Link>
							)
						))}
					</div>
				</DialogPanel>
			</Dialog>
		</header>
	)
}
