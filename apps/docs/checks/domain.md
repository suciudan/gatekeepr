---
order: 90
icon: globe
meta:
  title: "Domain Name | Gatekeepr"
---

# Domain Name

## RFC 1035 Check

This check ensures that the domain portion of the email address follows the syntax rules defined by 
[RFC 1035](https://datatracker.ietf.org/doc/html/rfc1035), which specifies valid domain name formats. It verifies that 
the domain contains allowed characters (letters, digits, hyphens), no leading or trailing hyphens, and labels separated 
by dots without empty segments. This prevents obviously malformed or invalid domains from passing further validation.

Here are some examples of emails which will fail this check:

{.compact}
Email   | Reason
---    | ---
`user@-example.com` | Leading hyphen
`user@example-.com` | Trailing hyphen
`user@exa_mple.com` | Underscore not allowed
`user@.example.com` | Leading dot
`user@example..com` | Empty label

## Domain MX Verification

This check first confirms that the email's domain has valid Mail Exchange (MX) records configured in DNS, proving it can
actually receive email. Without MX records, a domain cannot accept messages, which is a strong indicator that the
address is fake or misconfigured.

When MX records are present, Gatekeepr performs a second verification step. It resolves the MX hostnames and compares
both the MX hostnames and the resolved MX IP addresses against the active disposable-mail infrastructure collected from
known disposable domains. This catches custom domains that are not themselves on the disposable list but still route
mail through disposable-provider infrastructure.

Here are some examples of emails which will fail this check:

{.compact}
Email   | Reason
---    | ---
`user@nonexistentdomain.xyz` | Domain does not exist
`user@noemailserver.com` | Domain exists but no MX records
`user@invalid.example` | Invalid TLD with no DNS resolution
`user@localhost` | Not resolvable in public DNS
`user@fake-domain.test` | Test domain without mail servers
`user@custom-burner-domain.com` | MX host overlaps with known disposable infrastructure
`user@white-label-tempmail.net` | MX IP overlaps with active disposable provider MX IPs

When the MX infrastructure overlap is detected, the API raises `domain_mx_disposable_infra`. The response may also
include `info.domain_mx_disposable_hosts`, `info.domain_mx_disposable_ipv4`, and
`info.domain_mx_disposable_ipv6` to show what matched.

## Domain Age Check

This check evaluates how long the email's domain has existed by querying WHOIS registration data. Domains registered 
less than 7 days ago are marked as suspicious, as fresh domains are often created for abuse or spam campaigns. 
Additionally, expired or inactive domains are flagged since they typically cannot receive email reliably and may be 
repurposed for fraudulent use.

Here are some examples of emails which will fail this check:

{.compact}
Email   | Reason
---    | ---
`user@brandnewdomain.com` | Registered 2 days ago
`user@recently-created.net` | Registered 5 days ago
`user@expired-domain.org` | Domain registration lapsed
`user@newsignup.co` | Registered 1 day ago
`user@oldbutexpired.com` | Recently expired and inactive
