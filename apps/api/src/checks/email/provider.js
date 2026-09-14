import { measurePerformance } from "@repo/core/performance"

const providers = {
	aol: [
		"aim.com", "aol.at", "aol.be", "aol.ch", "aol.cl", "aol.co.nz", "aol.co.uk", "aol.com", "aol.com.ar",
		"aol.com.au", "aol.com.br", "aol.com.co", "aol.com.mx", "aol.com.tr", "aol.com.ve", "aol.cz", "aol.de",
		"aol.dk", "aol.es", "aol.fi", "aol.fr", "aol.hk", "aol.in", "aol.it", "aol.jp", "aol.kr", "aol.nl", "aol.pl",
		"aol.ru", "aol.se", "aol.tw", "aolchina.com", "aolnews.com", "aolvideo.com",
		"wow.com", "when.com",
		"netscape.com", "wmconnect.com"
	],
	gmail: ["gmail.com", "googlemail.com"],
	outlook: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
	icloud: ["icloud.com", "me.com", "mac.com"],
	proton: ["protonmail.com", "proton.me"],
	yahoo: [
		"compuserve.com", "citlink.net", "cs.com", "csi.com", "frontiernet.net", "geocities.com", "goowy.com",
		"lemondrop.com", "mcom.com", "netscape.net", "newnorth.net", "safesocial.com", "spinner.com", "switched.com",
		"urlesque.com", "wild4music.com", "rocketmail.com",
		"myyahoo.com", "y7mail.com", "yahoo.at", "yahoo.be", "yahoo.bg", "yahoo.ca", "yahoo.cl", "yahoo.co.id",
		"yahoo.co.il", "yahoo.co.in", "yahoo.co.kr", "yahoo.co.nz", "yahoo.co.th", "yahoo.co.uk", "yahoo.co.za",
		"yahoo.com", "yahoo.com.ar", "yahoo.com.au", "yahoo.com.br", "yahoo.com.co", "yahoo.com.hk", "yahoo.com.hr",
		"yahoo.com.mx", "yahoo.com.my", "yahoo.com.pe", "yahoo.com.ph", "yahoo.com.sg", "yahoo.com.tr", "yahoo.com.tw",
		"yahoo.com.ua", "yahoo.com.ve", "yahoo.com.vn", "yahoo.cz", "yahoo.de", "yahoo.dk", "yahoo.ee", "yahoo.es",
		"yahoo.fi", "yahoo.fr", "yahoo.gr", "yahoo.hu", "yahoo.ie", "yahoo.in", "yahoo.it", "yahoo.lt", "yahoo.lv",
		"yahoo.nl", "yahoo.no", "yahoo.pl", "yahoo.pt", "yahoo.ro", "yahoo.se", "yahoo.sk", "ygm.com", "ymail.com",
	]
}

export const findProviderByDomain = (domain) => {
	for(const [provider, domains] of Object.entries(providers)) {
		if(domains.includes(domain.toLowerCase())) {
			return provider
		}
	}
	return null
}

export const emailKnownProviderCheck = async (ctx) => {
	
	const { email } = ctx.payload
	
	let start
	
	if(measurePerformance()) start = performance.now()
	
	const domain = email.split("@")[1]
	const provider = findProviderByDomain(domain)
	
	if(provider) {
		ctx.info.email_known_provider = provider
		if(measurePerformance()) ctx.performance.email_known_provider = performance.now() - start
	}
	
}
