import { emailCompositionCheck } from "../checks/email/composition.js"
import { emailKnownProviderCheck } from "../checks/email/provider.js"
import { emailDisposableCheck } from "../checks/email/disposable.js"
import { emailSeparatorCheck } from "../checks/email/separator.js"
import { emailSuspiciousTagCheck } from "../checks/email/tag.js"
import { emailRoleCheck } from "../checks/email/role.js"

import { domainAgeCheck } from "../checks/domain/ageCheck.js"
import { domainHttpsCheck } from "../checks/domain/https.js"
import { domainValidCheck } from "../checks/domain/valid.js"
import { domainMxCheck } from "../checks/domain/mxCheck.js"

import { ipCloudflareCheck } from "../checks/ip/cloudflare.js"
import { blocklistUaCheck } from "../checks/ip/blocklistUa.js"
import { spamhausDropCheck } from "../checks/ip/spamhaus.js"
import { ipProviderCheck } from "../checks/ip/provider.js"
import { ipiCloudCheck } from "../checks/ip/icloud.js"
import { ipValidCheck } from "../checks/ip/valid.js"
import { ipTypeCheck } from "../checks/ip/type.js"
import { ipTorCheck } from "../checks/ip/tor.js"
import { ipAwsCheck } from "../checks/ip/aws.js"

import { notBrowserCheck } from "../checks/ua/notBrowser.js"
import { browserVersionCheck } from "../checks/ua/browserVersion.js"

export default {
	
	/**
	 * Email
	 */
	
	emailCheck: {
		deps: [],
		fn: () => {}
	},
	emailDisposableCheck: {
		deps: ["emailCheck"],
		fn: emailDisposableCheck,
	},
	emailRoleCheck: {
		deps: ["emailCheck"],
		fn: emailRoleCheck
	},
	emailKnownProvider: {
		deps: ["emailCheck"],
		fn: emailKnownProviderCheck
	},
	emailSeparatorCheck: {
		deps: ["emailCheck"],
		fn: emailSeparatorCheck
	},
	emailSuspiciousTagCheck: {
		deps: ["emailCheck"],
		fn: emailSuspiciousTagCheck
	},
	emailCompositionCheck: {
		deps: ["emailCheck"],
		fn: emailCompositionCheck
	},
	
	/**
	 * Domain
	 */
	
	domainValidCheck: {
		deps: ["emailCheck", "emailKnownProvider"],
		fn: domainValidCheck
	},
	domainMxCheck: {
		deps: ["domainValidCheck", "emailKnownProvider", "emailDisposableCheck"],
		fn: domainMxCheck
	},
	domainAgeCheck: {
		deps: ["domainValidCheck", "emailKnownProvider"],
		fn: domainAgeCheck
	},
	domainHttpsCheck: {
		deps: ["domainValidCheck", "emailKnownProvider"],
		fn: domainHttpsCheck
	},
	
	/**
	 * IP
	 */
	
	ipValidCheck: {
		deps: [],
		fn: ipValidCheck
	},
	ipTypeCheck: {
		deps: ["ipValidCheck"],
		fn: ipTypeCheck
	},
	ipProviderCheck: {
		deps: ["ipValidCheck"],
		fn: ipProviderCheck
	},
	ipTorCheck: {
		deps: ["ipValidCheck"],
		fn: ipTorCheck
	},
	ipiCloudCheck: {
		deps: ["ipValidCheck"],
		fn: ipiCloudCheck
	},
	ipAwsCheck: {
		deps: ["ipValidCheck"],
		fn: ipAwsCheck
	},
	ipCloudflareCheck: {
		deps: ["ipValidCheck"],
		fn: ipCloudflareCheck
	},
	spamhausDropCheck: {
		deps: ["ipValidCheck"],
		fn: spamhausDropCheck
	},
	blocklistUaCheck: {
		deps: ["ipValidCheck"],
		fn: blocklistUaCheck
	},
	
	/**
	 * User Agent
	 */
	
	notBrowserCheck: {
		deps: [],
		fn: notBrowserCheck
	},
	browserVersionCheck: {
		deps: [],
		fn: browserVersionCheck
	}
	
}
