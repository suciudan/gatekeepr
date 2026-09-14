# API Test Coverage Plan

## Summary
- The API already has a small set of active unit tests, but coverage is still unsystematic: no coverage tool, no enforcement, no route-level harness, one disabled live-network domain test, and most middleware/checks remain untested.
- Build a deterministic local-only API test strategy that covers all current middleware, actions, and email/domain/IP/UA checks without requiring live MySQL, Redis, DNS, WHOIS, or internet access.
- Keep Mocha as the runner, add measured coverage with a hard local gate, and use a thin HTTP smoke layer only for endpoint wiring.

## Interfaces
- Add a new contributor-facing command: `yarn workspace api test:coverage`.
- Split server startup from app construction so tests can import an Express app without calling `listen`; keep a tiny bootstrap entrypoint and expose an app factory or importable app module for smoke tests.
- Keep default runtime exports stable, but add injectable factory forms for I/O-heavy middleware/checks so tests can pass fake DB, Redis, DNS, WHOIS, fetch, and logger adapters.
- Add coverage configuration for `apps/api/src/**` with an initial hard gate of `95%` lines and `90%` branches.
- Do not change GitHub workflows in this plan; enforcement is local-only for now.

## Key Changes
- Test harness: add `c8` for coverage and `supertest` for thin endpoint smoke tests; keep Mocha as the main runner.
- App structure: move Express composition into a testable app module and leave `apps/api/index.js` as minimal startup glue; exclude only the tiny bootstrap file from coverage if needed.
- Dependency seams: refactor direct external-I/O modules to expose factory-based or helper-based injection points instead of hard-wired imports. Cover at least `apiKeyMiddleware`, `usageMiddleware`, disposable/domain/IP checks that hit Redis/DNS/WHOIS/fetch, and any route wiring that currently depends on concrete runtime modules.
- Shared test helpers: add reusable request/response doubles, fake context builders, and lightweight fake adapters for DB, Redis, DNS, WHOIS, fetch, and logger calls so tests stay deterministic and concise.
- Replace the disabled live `domain.test.js_` approach with active deterministic tests driven by injected responses, not real domain lookups.

## Test Plan
- Endpoint smoke tests:
  - `GET /` returns the welcome payload.
  - `POST /ping` returns `pong` for a valid API key and rejects missing/invalid/disabled keys.
  - `POST /` covers success payloads plus `400`, `401`, and `402` middleware paths.
- Middleware tests:
  - `apiKeyMiddleware` for missing, unknown, disabled, and valid keys.
  - `ctxMiddleware` for payload shaping and trimming.
  - `emailMiddleware` for required/invalid/valid email handling.
  - `usageMiddleware` for allow, deny, and usage logging behavior.
- Check coverage:
  - Email: RFC 5322, provider detection, disposable domains, role detection, separator variants, `+` tag detection, composition rules.
  - Domain: valid/missing/invalid, known-provider skip behavior, WHOIS settled/fresh/unregistered/expired/error, MX success/empty/error, HTTPS certificate failure vs non-blocking fetch failure.
  - IP: valid/invalid, private vs public typing, ASN residential/datacenter/not-found/error, Tor, AWS, Cloudflare, iCloud, Spamhaus, Blocklist.net.ua.
  - UA and libs: scraper detection, status resolver, response finalizer, checks graph ordering, entropy/conf helpers where behavior is non-trivial.
- Acceptance criteria:
  - `yarn workspace api test` passes.
  - `yarn workspace api test:coverage` passes at `95%` lines and `90%` branches.
  - No API test depends on live MySQL, Redis, DNS, WHOIS, or internet access.

## Assumptions
- Keep Mocha rather than switching test frameworks.
- Use `c8` rather than `nyc` for Node/ESM coverage.
- Use `supertest` only for thin route smoke tests; most coverage should come from deterministic unit tests with injected seams.
- “All checks + middleware” means broad first-pass coverage across the current API code under `apps/api/src`, not `packages/core`, `packages/db`, cron jobs, or deployment workflows.
