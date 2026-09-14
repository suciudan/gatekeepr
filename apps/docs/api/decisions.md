---
order: 50
icon: bug
meta:
  title: "Decision Outcomes | Gatekeepr"
---

# Decision Outcomes

The API returns a final `status` decision instead of a numeric score. The decision is derived from the triggered threats
and always has one of these values:

- `allow`
- `challenge`
- `block`

Use `status` for the product decision, then inspect `threats`, `trust`, `blocklists`, and `info` for the exact signals
behind it.

## Decision Rules

### Allow

The API returns `allow` when no threats are detected.

### Challenge

The API returns `challenge` when one or more non-blocking threats are present, but no hard-deny signal fired. This
includes uncertain or incomplete verification cases such as lookup failures or low-confidence heuristics.

### Block

The API returns `block` as soon as any blocking threat is present in the final threat list.

## Blocking Threats

{.compact}
| Threat                        | Meaning |
| ----------------------------- | ------- |
| `domain_missing`              | The email had no domain part |
| `domain_invalid`              | The domain failed syntax validation |
| `domain_unregistered`         | WHOIS did not return a registered domain |
| `domain_expired`              | The domain is expired |
| `domain_mx_disposable_infra`  | The domain's MX hosts or MX IPs overlap with disposable mail infrastructure |
| `ip_tor_exit_node`            | The IP is a Tor exit node |
| `ip_blocklist_spamhaus_drop`  | The IP appears on Spamhaus DROP |
| `ip_blocklist_net_ua`         | The IP appears on Blocklist.net.ua |
| `email_disposable`            | The email uses a disposable inbox domain |
| `email_local_sep_abuse`       | The local part is composed almost entirely of separators |
| `email_local_double_sep`      | The local part contains repeated separators like `..` or `__` |
| `email_local_sep_high_count`  | The local part contains too many separators |
| `email_local_sep_high_density`| Separators make up too much of the local part |

## Notes

- `domain_whois_error`, `domain_mx_check_error`, `ip_asn_lookup_error`, and `ip_asn_not_found` stay in `challenge`
  because they represent uncertainty or partial verification, not confirmed abuse.
- `email_disposable` is the exact-domain match. `domain_mx_disposable_infra` is the domain-layer infrastructure match
  used when the exact domain is not on the disposable list but its MX routing overlaps with disposable providers.
- `email_suspicious_tag` also stays in `challenge` by itself. A `+` alias is treated as suspicious, but not as an
  automatic hard deny.
- `ip_aws`, `ip_cloudflare`, and `ip_icloud_relay` also stay in `challenge` by themselves. They indicate privacy or
  hosting infrastructure that may warrant extra verification, not an automatic block.
- `ua_browser_outdated`, `ua_browser_unsupported`, and `ua_browser_version_suspicious` stay in `challenge` by
  themselves. They indicate stale, legacy, or suspicious browser version claims, but user agents are client-controlled.
- The API still returns the full threat list even when a blocking threat is present, except for the existing structural
  halts used for invalid request flows.
- For detailed behavior of each check, see the **Checks** section.
