# Data Sources and Redistribution Notes

Gatekeepr uses public data sources to enrich abuse checks. The monorepo publishes the fetching and detection code, not production databases or downloaded/merged feed snapshots. Its MIT license does not relicense upstream data. The links below record the source review for the initial release; verify the exact upstream revision and terms again before distributing generated data.

## Disposable Email Domains

Used by `apps/crons/src/libs/disposable-emails.js`.

| Source | URL | Notes |
| --- | --- | --- |
| disposable-email-domains | [Repository](https://github.com/disposable-email-domains/disposable-email-domains) | [CC0 dedication](https://github.com/disposable-email-domains/disposable-email-domains/blob/main/LICENSE.txt). Record the source revision for derived data. |
| TempMailDetector Temporary Email Domain Blocklist | [Repository](https://github.com/TempMailDetector/Temporary-Email-Domain-Blocklist) | No explicit license file was found in the reviewed repository. Redistribution permission remains unresolved; obtain permission or omit this source from published datasets. |
| Propaganistas Laravel Disposable Email | [Repository](https://github.com/Propaganistas/Laravel-Disposable-Email) | Review the package license and the provenance of its aggregated domain list separately before redistribution. |
| wesbos burner-email-providers | [Repository](https://github.com/wesbos/burner-email-providers) | [MIT](https://github.com/wesbos/burner-email-providers/blob/master/LICENSE); preserve its copyright and license notice in redistributed copies. |
| disposable/disposable-email-domains | [Repository](https://github.com/disposable/disposable-email-domains) | [MIT](https://github.com/disposable/disposable-email-domains/blob/master/LICENSE); also inspect the source map for aggregated entries. |
| unkn0w disposable-email-domain-list | [Repository](https://github.com/unkn0w/disposable-email-domain-list) | [MIT](https://github.com/unkn0w/disposable-email-domain-list/blob/main/LICENSE); preserve upstream notices. |
| 7c fakefilter | [Repository](https://github.com/7c/fakefilter) | [BSD 3-Clause](https://github.com/7c/fakefilter/blob/main/LICENSE.md); retain its copyright, conditions, and disclaimer in distributions. |
| Disify blacklist | `https://disify.com/blacklist/domains` | Public endpoint. Verify terms before redistributing. |

## IP and Network Intelligence

Used by `apps/crons/src/refresh-*.js`.

| Source | URL | Notes |
| --- | --- | --- |
| Tor exit list | `https://www.dan.me.uk/torlist` | Respect upstream request limits and terms. |
| Spamhaus DROP | `https://www.spamhaus.org/drop/` | Review Spamhaus terms before redistribution or commercial use. |
| Blocklist.net.ua | `https://blocklist.net.ua/blocklist.csv` | Verify redistribution and attribution requirements. |
| AWS IP ranges | `https://ip-ranges.amazonaws.com/ip-ranges.json` | Public provider data. |
| Cloudflare IP ranges | `https://www.cloudflare.com/ips-v4`, `https://www.cloudflare.com/ips-v6` | Public provider data. |
| Apple iCloud Private Relay | `https://mask-api.icloud.com/egress-ip-ranges.csv` | Public Apple relay egress ranges. |
| PeeringDB | `https://www.peeringdb.com/api/net` | Requires API key in this repo's cron flow; verify PeeringDB terms. |

## Browser Versions

Used by `packages/core/src/browser-versions.js` and `apps/crons/src/refresh-browser-versions.js`.

| Source | URL | Notes |
| --- | --- | --- |
| Chrome Version History API | `https://versionhistory.googleapis.com/` | Public version metadata. |
| Mozilla product details | `https://product-details.mozilla.org/` | Public Firefox version metadata. |
| Microsoft Edge updates API | `https://edgeupdates.microsoft.com/api/products` | Public Edge version metadata. |
| Apple Safari release notes | `https://developer.apple.com/tutorials/data/documentation/safari-release-notes.json` | Public Apple developer metadata. |
| Samsung Internet release notes | `https://developer.samsung.com/internet/release-note/` | Public release notes; verify scraping/redistribution terms. |
| Opera public release directory | `https://get.geo.opera.com/pub/opera/desktop/` | Public release directory; verify terms before redistribution. |

## Publication Rules

- Keep source URLs and generation timestamps in generated artifacts.
- Do not publish generated datasets until source terms have been reviewed.
- The example environment disables automatic publishing. Enabling a publisher does not resolve upstream redistribution permissions.
- Prefer publishing methodology and code over republishing merged third-party data when license compatibility is unclear.
- Document any newly added source in this file in the same change that adds the fetch logic.
