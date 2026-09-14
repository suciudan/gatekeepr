# API Improvements

## Summary

The API baseline is healthy: `yarn workspace api test` passes with `152 passing`.
The highest-value improvements are around request correctness, usage accounting,
operational resilience, and API contract clarity rather than fixing a broken test
suite.

## Priority Improvements

1. Harden request validation.
   Add a small schema layer for the request body, normalize email/domain casing,
   require string values for `email`, `ip`, and `user_agent`, and return
   consistent JSON `400` responses for malformed input. Today `ctxMiddleware`
   trims body fields directly, so non-string values can throw before validation.

2. Fix IP check gating.
   After `ip_invalid`, skip all downstream IP reputation checks or reject the
   request with `400`. The current graph only depends on `ipValidCheck`, so
   checks can still run against invalid public-looking IP input unless each check
   happens to gate itself through `ctx.info.ipv4` or `ctx.info.ipv6`.

3. Make usage accounting atomic.
   Replace the separate `checkUsage` and `logUsage` calls with one atomic Redis
   script or transaction. This avoids concurrency races and prevents charging
   requests that later fail during processing. The implementation should also
   align the Redis counter with each user's configured `rpm`.

4. Reduce PII and secrets in logs/cache.
   Redact or hash API keys and email addresses in operational logs. Cache only
   the domain metadata required by the checks instead of full WHOIS/RDAP raw
   payloads where possible.

5. Improve operational resilience.
   Configure Redis explicitly, add connection/error handling, and define degraded
   behavior for lookup outages. The API depends on Redis for usage, blocklists,
   disposable domains, ASN metadata, and caches, so failures should be visible
   and controlled.

6. Tighten the API/security surface.
   Add a JSON error handler, `helmet`, request IDs, content-type/body-size
   enforcement, and a proxy-aware setup such as `app.set("trust proxy", ...)`.
   Production rate limiting should be keyed appropriately for the deployment
   model instead of only using a broad global limiter.

7. Version and document the contract.
   Add a canonical `/v1/check` endpoint while keeping `POST /` as a compatibility
   alias. Define an OpenAPI or shared schema source so docs, tests, and runtime
   validation stay aligned.

## Suggested First Implementation Pass

- Add request schema validation and tests for non-string body fields, oversized
  body payloads, unsupported content types, invalid IP input, and normalized
  email/domain handling.
- Update the IP dependency graph so reputation checks require a confirmed IP
  type or explicitly return early after `ip_invalid`.
- Replace usage check/decrement with an atomic Redis operation and test parallel
  request behavior.

## Test Plan

- Run `yarn workspace api test`.
- Add focused Mocha tests for request validation, invalid IP short-circuiting,
  atomic usage decrement behavior, and redaction of sensitive log values.
- For contract/versioning changes, add routing tests for both `POST /v1/check`
  and the compatibility `POST /` alias.

## Notes

- Existing unrelated site/archive changes were present in the worktree during
  this analysis and should be left untouched.
- This plan is documentation only; it does not implement the API changes.
