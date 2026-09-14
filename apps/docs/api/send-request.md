---
order: 80
icon: paper-airplane
meta:
  title: "Send a request | Gatekeepr"
---

# Send a request

To analyze a signup or login event, send a POST request to the `/` endpoint with the following fields:

{.compact}
Email   | Type | Required | Reason
---    | --- | --- | ---
`email` | string | yes | The email address to verify
`ip` | string | no | The user's IPv4 or IPv6 address
`user_agent` | string | no | The full User-Agent string from the HTTP headers.

## Code Samples

+++ shell
:::code source="../static/samples/send/send.sh":::
+++ node.js
:::code source="../static/samples/send/send.js":::
+++ php
:::code source="../static/samples/send/send.php":::
+++

## Response

The API returns a JSON object containing the final decision, triggered threats, trust signals, and supporting metadata:

```json
{
  "threats": [],
  "trust": [
    "email_passes_rfc5322"
  ],
  "blocklists": [],
  "info": {
    "email_known_provider": "gmail"
  },
  "status": "allow"
}
```

!!!
Use `status` for the final allow/challenge/block decision, and inspect `threats` for the exact rules that fired.
!!!

If a domain is not directly listed as disposable but its MX routing overlaps with active disposable-mail
infrastructure, the API can return `domain_mx_disposable_infra` together with matched MX hosts and MX IPs:

```json
{
  "threats": [
    "domain_mx_disposable_infra"
  ],
  "trust": [
    "email_passes_rfc5322",
    "domain_valid"
  ],
  "blocklists": [],
  "info": {
    "domain_mx_disposable_hosts": [
      "mx1.mailinator.com"
    ],
    "domain_mx_disposable_ipv4": [
      "203.0.113.10"
    ]
  },
  "status": "block"
}
```

## Errors

{.compact}
Code   | Reason
---    | ---
`401` | The API key you are trying to use is not valid
