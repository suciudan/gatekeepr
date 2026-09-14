# Replace `fraud_score` With `status`

## Summary
- Change the successful `POST /` API response from numeric `fraud_score` to a single `status` string.
- Supported values: `approve`, `challenge`, `block`.
- Keep request validation behavior unchanged: malformed or missing email still returns `400` with the current error payload.

## Key Changes
- In the API response builder, remove `fraud_score` and compute `status` from `ctx.threats` instead.
- Implement a dedicated status resolver instead of reusing score math.
- Use this decision policy:
  - `approve` when no threats fired.
  - `block` when any of these threats is present: `domain_missing`, `domain_invalid`, `domain_unregistered`, `domain_expired`, `ip_tor_exit_node`, `ip_blocklist_spamhaus_drop`, `ip_blocklist_net_ua`, `email_disposable`, `email_local_sep_abuse`, `email_local_double_sep`, `email_local_sep_high_count`, `email_local_sep_high_density`, `email_suspicious_tag`.
  - `challenge` for every other successful response that has at least one threat.
- Redefine `email_suspicious_tag` to mean any `+` anywhere in the local part. Remove the old heuristic tag behavior based on length/entropy, and do not treat `-` or `=` as tag separators anymore.
- Keep collecting other checks after a blocking flag is found so the API still returns the full threat list, except for the existing structural halts already used by the pipeline.
- Treat lookup or verification uncertainty as `challenge`, not `block`, including `domain_whois_error`, `domain_mx_check_error`, `ip_asn_lookup_error`, and `ip_asn_not_found`.
- Remove the now-unused score runtime pieces from the API path if nothing else imports them.
- Update internal consumers that currently read `fraud_score`:
  - [process.js](D:\Projects\gatekeepr\apps\api\src\actions\process.js)
  - [send-request.md](D:\Projects\gatekeepr\apps\docs\api\send-request.md)
  - [TryItNow.jsx](D:\Projects\gatekeepr\apps\site\src\components\Hero\TryItNow.jsx)
- Refresh docs and marketing copy anywhere they describe a numeric fraud score so they instead describe a status decision plus the returned threat list.
- Keep the existing docs route that currently lives under `api/fraud-score` for now, but rewrite its content to document the new status model so existing links do not break.

## Public Interface
- Successful response shape changes from `fraud_score: number` to `status: "approve" | "challenge" | "block"`.
- This is a direct response-contract change with no version/header gating.
- Validation errors remain non-status error responses, so `email_invalid` and `email_required` stay as `400`.
- The `threats` list remains part of the response, but `email_suspicious_tag` changes meaning to “plus-address present.”

## Test Plan
- Add Mocha tests for the status resolver covering:
  - no threats => `approve`
  - one non-blocking threat => `challenge`
  - one blocking threat => `block`
  - mixed threats with at least one blocking threat => `block`
- Add tag-rule tests proving any `+` alias triggers `email_suspicious_tag`, while `-` and `=` no longer count as tags.
- Add tests covering the blocking separator flags so each one maps to final `status: "block"`.
- Add an action-level test for the success payload to verify `status` exists and `fraud_score` is absent.
- Add a regression test proving the API still returns multiple threats even when one blocking flag has already fired.
- Add a regression test for the email middleware path so invalid email still returns `400` and does not return a status payload.
- Update demo/example payloads in docs and site fixtures to use `status`.

## Assumptions
- “Instead of the score” means the successful API response should no longer expose `fraud_score`.
- Any successful analysis with at least one non-blocking threat should be `challenge`; there is no separate low-risk approve-with-warnings state.
- Plus-addresses are intentionally treated as suspicious and blocking, even though some providers support them for legitimate mailbox aliasing.
- Existing full API tests are already red because of the unrelated `email_local_high_entropy` assertion; do not expand scope to fix that unless it blocks the new targeted tests.
