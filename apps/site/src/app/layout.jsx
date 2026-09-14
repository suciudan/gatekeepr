import { Geist, Geist_Mono } from "next/font/google"
import Script from "next/script"
import clsx from "clsx"

import "./globals.css"

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"]
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"]
});

export const metadata = {
	metadataBase: new URL("https://gatekeepr.io"),
	title: "Gatekeepr",
	description: "Detect disposable emails and automated sign-ups, keeping your free tier for real users only."
}

export default function RootLayout({ children }) {
	return (
		<html lang="en">
            <body
                className={clsx(`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950`)}
            >
	            <Script
		            src="https://plausible.gatekeepr.io/js/script.file-downloads.hash.outbound-links.pageview-props.revenue.tagged-events.js"
		            data-domain="gatekeepr.io"
		            strategy="afterInteractive"
	            />
	            <Script id="plausible-shim" strategy="afterInteractive">
		            {`window.plausible = window.plausible || function() { (window.plausible.q = window.plausible.q || []).push(arguments) }`}
	            </Script>
                {children}
            </body>
		</html>
	)
}
