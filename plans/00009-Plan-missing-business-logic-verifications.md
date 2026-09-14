# Missing Business Logic Verifications

## Summary

Gatekeepr already covers disposable domains, disposable MX infrastructure, domain syntax/MX/age, cloud/Tor/blocklist IPs, local-part heuristics, and basic user-agent checks. The biggest missing verification families are identity normalization, mail-capability nuance, relay/provider intelligence, tenant-scoped history, and customer-owned policy.

Prioritize the cheap synchronous checks first because they fit the current `threats`, `trust`, and `info` response model without slowing the default API path.

## Priority Checks

1. Email canonicalization and alias dedupe
   - Normalize provider-specific variants into `info.email_canonical`.
   - Cover Gmail dots, Gmail/Googlemail equivalence, plus aliases, and provider-specific casing rules where known.
   - Use the canonical value for repeat-trial detection and future customer policy matching.
   - Emit informational metadata first; do not block solely because an alias is present.

2. Provider typo detection
   - Add `email_typo_domain` for near-miss public-provider domains such as `gmal.com`, `hotnail.com`, and `outlok.com`.
   - Include `info.email_suggested` with the corrected domain or full suggested address.
   - Treat this as `challenge`, not `block`, because typo detection can be wrong and legitimate custom domains may resemble provider names.

3. Explicit null-MX detection
   - Distinguish domains that explicitly publish null MX from domains that merely have no MX records.
   - Add `domain_null_mx` for RFC 7505-style `MX 0 .` records.
   - Treat null MX as stronger than generic `domain_no_mx`, because it means the domain declares it does not accept email.

4. Relay and private-forwarding domains
   - Add `email_relay_domain` for Apple Private Relay, Firefox Relay, SimpleLogin, DuckDuckGo Email Protection, and similar forwarding services.
   - Keep privacy relays in `challenge` by default; they are not disposable inboxes, but they weaken durable-identity assumptions.
   - Add `info.email_relay_provider` when the provider is known.

5. Unicode and IDN homograph checks
   - Add domain-side checks for punycode, mixed-script labels, and visually confusable domains.
   - Emit `domain_idn_suspicious` or `domain_homograph_suspicious` as `challenge`.
   - Keep the current local-part mixed-script check separate from domain homograph detection.

6. Public suffix / registrable-domain parsing
   - Use Public Suffix List parsing for eTLD+1 grouping.
   - Apply it to typo detection, velocity grouping, customer policy, and domain-family metadata.
   - Avoid treating public suffixes such as `co.uk` as customer-owned domains.

7. Tenant-scoped velocity
   - Add Redis counters keyed by API key for short-window signup patterns.
   - Track high signup velocity by IP, registrable domain, canonical email, and local-part pattern.
   - Candidate threats: `ip_signup_velocity_high`, `domain_signup_velocity_high`, `email_canonical_reuse`, and `email_local_pattern_reuse`.
   - Start as `challenge` signals until production traffic proves a safe blocking threshold.

8. Customer policy lists
   - Add workspace-scoped allow, block, and suppress lists for exact emails, canonical emails, domains, and registrable domains.
   - Candidate signals: `email_customer_blocklisted`, `domain_customer_blocklisted`, `email_customer_allowlisted`, and `email_suppressed`.
   - Use canonicalized values for matching where possible.

## API Surface

- Keep `POST /` unchanged.
- Extend existing response fields only:
  - `threats`: add typo, null-MX, relay, IDN/homograph, velocity, and customer-policy signals.
  - `trust`: add public-provider and customer-allowlist signals where appropriate.
  - `info`: add canonical email, suggested correction, relay provider, registrable domain, and velocity counters.
- Do not introduce a numeric score or change existing `allow` / `challenge` / `block` semantics.
- Default unknown or low-confidence checks to `challenge`, not `block`.

## Test Plan

- Canonicalization: Gmail dots, plus aliases, Googlemail equivalence, non-Gmail providers that should not ignore dots, and canonical collision cases.
- Typo detection: common public-provider typos, legitimate custom domains that should not be corrected, and suggestions in `info.email_suggested`.
- Null MX: explicit `MX 0 .`, no MX, normal MX, and MX lookup error cases.
- Relay domains: Apple, Firefox Relay, SimpleLogin, DuckDuckGo, known public inbox providers, and disposable domains taking precedence.
- IDN/homograph: punycode labels, mixed-script domain labels, confusable domains, and normal ASCII domains.
- Public suffix parsing: `example.com`, `foo.example.co.uk`, public suffix-only inputs, and multi-tenant subdomain cases.
- Velocity: per-API-key isolation, threshold crossing, TTL expiry, canonical email reuse, and clean low-volume traffic.
- Customer policy: allowlist/blocklist precedence, exact versus canonical matching, domain versus registrable-domain matching, and tenant isolation.

## References

- Gmail dot behavior: https://support.google.com/mail/answer/7436150
- Null MX: https://www.rfc-editor.org/rfc/rfc7505
- Apple Private Email Relay: https://developer.apple.com/documentation/signinwithapple/communicating-using-the-private-email-relay-service
- Unicode security mechanisms: https://www.unicode.org/reports/tr39/
- Public Suffix List: https://publicsuffix.org/
