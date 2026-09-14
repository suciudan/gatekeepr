---
order: 70
icon: person
meta:
  title: User Agent | Gatekeepr
---

# User Agent

## Automated Tools Check

We maintain a list of known automation frameworks command-line clients and headless environments commonly used for 
bot-driven signups scraping or abuse. If the incoming user agent string matches or contains any substring from this 
list it is flagged as suspicious and contributes to the final API status accordingly.

The following substrings are examples of known non-browser or automation-related clients we detect:

```
curl/
Wget/
HTTPie/
python-requests/
Python-urllib/
Go-http-client/
Java/
Apache-HttpClient/
libwww-perl/
LWP::Simple
GuzzleHttp/
PostmanRuntime/
okhttp/
axios/
node-fetch/
HeadlessChrome
puppeteer/
ApacheBench/
feedparser/
Apple-PubSub/
AWS Lambda
```

## Outdated Browser Check

Gatekeepr also parses common browser user agents and compares the browser major version against a daily refreshed
browser-version dataset. Older browser versions are common in scraping stacks, replay tools, and neglected automation
images, so stale browsers are treated as a signal for extra verification.

This check uses the existing `user_agent` field only. It does not require browser Client Hints or any extra integration
fields.

Possible threats:

| Threat | Meaning |
| --- | --- |
| `ua_browser_outdated` | The browser is at least 3 stable major versions behind the current version |
| `ua_browser_unsupported` | The browser is very old, legacy, or from an unsupported browser family like IE/Trident |
| `ua_browser_version_suspicious` | The user agent claims a browser version newer than the known stable version by more than one major |

These threats return `challenge` by themselves, not `block`, because user agents can be spoofed and legitimate users can
lag browser updates.

When available, the response includes supporting metadata in `info`, such as `browser_name`, `browser_version`,
`browser_major`, `browser_latest_major`, `browser_major_lag`, and `browser_version_source`.
Chromium-derived browsers such as Samsung Internet, Opera, and Yandex Browser are identified by product name and assessed
by their embedded Chromium engine version when the user agent exposes one.

The public browser-version dataset is published to GitHub as `browser-versions.json`, `browser-versions.min.json`, and
`browser-versions.txt`. Each browser entry includes the current version and structured source metadata for current-version
data. Vendor EOL fields are left empty unless a real vendor or lifecycle source is available; Gatekeepr's outdated and
unsupported classifications use an internal major-version lag policy, not vendor EOL data.
