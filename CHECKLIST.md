# Checklist: Replace `fraud_score` With `status`

## Completed Decisions
- [x] Replace the successful `POST /` response field `fraud_score` with a single `status` field.
- [x] Keep the supported status values to `approve`, `challenge`, and `block`.
- [x] Keep malformed or missing email requests as `400` error responses instead of returning a status payload.
- [x] Use `approve` when no threats fire.
- [x] Use `challenge` for successful responses with non-blocking threats only.
- [x] Use `block` when any of these threats is present: `domain_missing`, `domain_invalid`, `domain_unregistered`, `domain_expired`, `ip_tor_exit_node`, `ip_blocklist_spamhaus_drop`, `ip_blocklist_net_ua`, `email_disposable`, `email_local_sep_abuse`, `email_local_double_sep`, `email_local_sep_high_count`, `email_local_sep_high_density`, `email_suspicious_tag`.
- [x] Redefine `email_suspicious_tag` to mean any `+` anywhere in the email local part.
- [x] Remove the old heuristic tag behavior and stop treating `-` or `=` as tag separators.
- [x] Keep collecting additional checks after a blocking flag is found, except for the existing structural halts already in the pipeline.
- [x] Treat lookup and verification uncertainty as `challenge`, not `block`, including `domain_whois_error`, `domain_mx_check_error`, `ip_asn_lookup_error`, and `ip_asn_not_found`.
- [x] Keep the existing docs route under `api/fraud-score` and rewrite its content instead of changing the route.

## API Implementation
- [x] Add a dedicated status resolver for final decision mapping.
- [x] Remove `fraud_score` calculation from the API success response.
- [x] Return `status` from the main process action.
- [x] Remove or retire score-specific runtime code if nothing else depends on it.
- [x] Update the email tag check so any `+` in the local part triggers `email_suspicious_tag`.
- [x] Remove the old suspicious-tag heuristic logic based on tag entropy or length.
- [x] Ensure `-` and `=` no longer count as tag separators.
- [x] Preserve the existing structural halt behavior for invalid email and invalid domain flows.

## Response And Consumer Updates
- [x] Update the response contract documentation from `fraud_score` to `status`.
- [x] Update the API send-request docs example to use `status`.
- [x] Rewrite the docs page under `api/fraud-score` to describe the status model and the final decision rules.
- [x] Update the site demo component to read and display `status` instead of `fraud_score`.
- [x] Update demo fixtures and example payloads to use `status`.
- [x] Refresh site and docs copy that still describes a numeric fraud score.

## Tests
- [x] Add Mocha tests for the status resolver covering `approve`, `challenge`, and `block`.
- [x] Add tests that prove any `+` alias triggers `email_suspicious_tag`.
- [x] Add tests that prove `-` and `=` no longer trigger tag detection.
- [x] Add tests covering the blocking separator flags so each one maps to `status: "block"`.
- [x] Add an action-level test that verifies `status` exists and `fraud_score` is absent from successful responses.
- [x] Add a regression test proving the API still returns multiple threats even when a blocking flag has already fired.
- [x] Add a regression test proving invalid email still returns `400` and does not return a status payload.

## Notes
- [x] The checklist tracks current planning decisions separately from implementation work.
- [x] Mark each remaining task as checked when the corresponding code, docs, or tests are completed.

## API Test Coverage Plan
- [x] Add `c8` coverage reporting and a new `yarn workspace api test:coverage` command.
- [x] Add `supertest` for thin endpoint smoke tests.
- [x] Split Express app construction from `listen` so tests can import the app without starting the server.
- [x] Add injectable seams or factory forms for I/O-heavy middleware and checks that currently depend on MySQL, Redis, DNS, WHOIS, `fetch`, or logging side effects.
- [x] Add shared API test helpers for fake request/response objects, context builders, and fake service adapters.
- [x] Replace the disabled live-network `apps/api/test/domain.test.js_` approach with deterministic tests driven by injected responses.
- [x] Add route smoke tests for `GET /`, `POST /ping`, and `POST /` covering success plus `400`, `401`, and `402` paths.
- [x] Add middleware coverage for `apiKeyMiddleware`, `ctxMiddleware`, `emailMiddleware`, and `usageMiddleware`.
- [x] Add broad deterministic check coverage for email, domain, IP, and user-agent checks, including skip paths and external-service failure branches.
- [x] Add coverage for non-trivial support libs such as checks graph wiring, response finalization, status mapping, entropy, and config parsing.
- [x] Configure API coverage to target `apps/api/src/**`, excluding only minimal bootstrap glue if necessary.
- [x] Enforce local coverage thresholds at `95%` lines and `90%` branches.
- [x] Ensure the API test suite runs without live MySQL, Redis, DNS, WHOIS, or internet access.
