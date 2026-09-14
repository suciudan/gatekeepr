# New API Checks: Current Inputs Only

## Summary

Add checks that use the existing `email`, `ip`, and `user_agent` request fields.
Prioritize signals that improve free-trial and signup abuse detection without
requiring customer integration changes.

## Key Checks

1. Email canonical alias check.
   Normalize known-provider aliases, especially Gmail/Googlemail dot and plus
   variants. Return `info.email_canonical` and add a non-blocking threat like
   `email_provider_alias` when the submitted address differs from canonical form.

2. Disposable parent-domain check.
   Use registrable-domain parsing so `user@sub.mailinator.com` can match
   `mailinator.com`. Add `email_disposable_parent_domain`; treat it as blocking
   like `email_disposable`.

3. Domain SPF/DMARC posture check.
   Query TXT records for SPF and `_dmarc.<domain>`. Add challenge-level threats
   for missing SPF, missing DMARC, or weak DMARC policy such as `p=none`. Add
   trust signals for strict DMARC (`quarantine`/`reject`) and SPF hard fail.

4. Domain registry status check.
   Reuse RDAP/WHOIS `status` already collected by `getDomainInfo`. Block domains
   with statuses like `clientHold`, `serverHold`, `inactive`, `pendingDelete`,
   or `redemptionPeriod`; challenge pending states that indicate instability.

5. Known cloud provider expansion.
   Add GCP and Azure IP range checks beside AWS/Cloudflare. Emit `ip_gcp` and
   `ip_azure` as challenge-level threats, with cron refresh jobs using official
   provider range data.

6. Proxy/VPN feed check.
   Add a separate optional IP feed check for known proxy/VPN/anonymizer ranges.
   Start as challenge-only because feed quality varies.

7. Domain lookalike/IDN check.
   Flag punycode domains and close lookalikes of major providers (`gmail`,
   `outlook`, `yahoo`, `proton`, `icloud`) as challenge-level threats.

## Implementation Notes

- Keep all new threats non-blocking except disposable parent-domain and bad
  registry statuses.
- Add checks to the existing dependency graph after email/domain/IP validation.
- Cache DNS TXT and RDAP-derived status checks with short TTLs to avoid latency
  spikes.
- Prefer returning explanatory `info` fields so customers can reason about
  decisions.

## Test Plan

- Unit-test each check with focused fixtures.
- Add integration tests for final `allow`/`challenge`/`block` outcomes.
- Verify docs list every new threat and whether it blocks or challenges.
- Run `yarn workspace api test`.

## Assumptions

- No public API request shape changes.
- Stateful velocity/reuse checks are deferred.
- Sources to use during implementation: RFC 7489 for DMARC, RFC 7208 for SPF,
  ICANN EPP status codes, OWASP automated account-creation guidance, Microsoft
  Azure service tags, and Google published IP range docs.
