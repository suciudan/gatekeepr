"use client"

import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react"
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline"
import { forwardRef } from "react"
import clsx from "clsx"

import SignOut from "@/components/Dashboard/SignOut"
import { Logo } from "@/components/Logo"
import Link from "next/link"
import { usePathname } from "next/navigation"

const navigation = [
	{ name: "Dashboard", href: "/dashboard" },
	{ name: "Docs", href: "https://docs.gatekeepr.io" },
]

const DisclosureLink = forwardRef(function DisclosureLink(props, ref) {
	return props.href.includes("http") ?
		<a ref={ref} {...props} rel="noopener noreferrer" target="_blank" /> :
		<Link ref={ref} {...props} />
})

export default function DashboardLayout({ children }) {
	const pathname = usePathname()
	return (
		<div className="min-h-full">
			<Disclosure as="nav" className="border-b-2 border-slate-800 bg-slate-950">
				<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="flex h-16 justify-between">
						<div className="flex">
							<div className="flex shrink-0 items-center">
								<Link href="/" className="inline-flex group">
									<Logo className={clsx(
										"h-10 w-auto text-blue-600 group-hover:text-blue-400 transition-all"
									)} />
								</Link>
							</div>
							<div className="hidden sm:-my-px sm:ml-6 sm:flex sm:space-x-8">
								{navigation.map((item) => (
									<DisclosureLink
										key={item.name}
										href={item.href}
										aria-current={item.href === pathname ? "page" : undefined}
										className={clsx(
											"inline-flex items-center border-b-2 px-1 pt-1 text-sm font-semibold",
											item.href === pathname ?
												"border-blue-600 text-white" :
												"border-transparent text-gray-400 hover:border-white/20 hover:text-gray-200",
										)}
									>
										{item.name}
									</DisclosureLink>
								))}
							</div>
						</div>
						<div className="hidden sm:ml-6 sm:flex sm:items-center">
							<SignOut />
						</div>
						<div className="flex items-center sm:hidden">
							<DisclosureButton
								className={clsx(
									"group relative inline-flex items-center justify-center rounded-md p-2 focus:outline-2 focus:outline-offset-2",
									"bg-gray-900 text-gray-400 hover:bg-white/5 hover:text-white focus:outline-blue-600"
								)}
							>
								<span className="absolute -inset-0.5" />
								<span className="sr-only">Open main menu</span>
								<Bars3Icon aria-hidden="true" className="block size-6 group-data-open:hidden" />
								<XMarkIcon aria-hidden="true" className="hidden size-6 group-data-open:block" />
							</DisclosureButton>
						</div>
					</div>
				</div>
				<DisclosurePanel className="sm:hidden">
					<div className="space-y-1 pt-2 pb-3">
						{navigation.map((item) => (
							<DisclosureButton
								key={item.name}
								as={DisclosureLink}
								href={item.href}
								aria-current={item.href === pathname ? "page" : undefined}
								className={clsx(
									item.href === pathname
										? "border-blue-600 bg-indigo-600/10 text-white"
										: "border-transparent text-gray-400 hover:border-gray-500 hover:bg-white/5 hover:text-gray-200",
									"block border-l-4 py-2 pr-4 pl-3 text-base font-medium",
								)}
							>
								{item.name}
							</DisclosureButton>
						))}
					</div>
				</DisclosurePanel>
			</Disclosure>
			<main>
				<div className="mx-auto max-w-7xl px-4 py-6 sm:py-8 lg:py-12 sm:px-6 lg:px-8 h-full">
					{children}
				</div>
			</main>
		</div>
	)
}
