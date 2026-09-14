# API Go Rewrite Performance Assessment

## Summary

Rewriting the API from Node.js/Express to Go would probably improve raw request
throughput, memory usage, startup behavior, and tail latency under very high
concurrency. It is unlikely to materially improve end-to-end request latency
until the current datastore and network-bound hot paths are measured and
optimized.

Recommendation: do not rewrite the API to Go for performance alone yet. First
benchmark the existing Node.js API with representative payloads, add per-check
latency visibility, and remove obvious Redis/MySQL round-trip costs.

## Current API Shape

- `apps/api/src/app.js` exposes a small Express API.
- `POST /` runs `apiKeyMiddleware`, `ctxMiddleware`, `emailMiddleware`,
  `usageMiddleware`, then `processAction`.
- `apps/api/src/actions/process.js` executes fraud checks using a dependency
  graph and `p-limit` concurrency of 5.
- The checks cover email, domain, IP, and user-agent signals.

The CPU-bound JavaScript work appears limited to validation, string parsing,
regex checks, IP arithmetic, graph orchestration, and JSON response construction.
The heavier parts are I/O-bound.

## Likely Bottlenecks

1. MySQL API-key lookup
   - `apiKeyMiddleware` queries the `user` table for every authenticated
     request.

2. Redis usage accounting
   - `usageMiddleware` calls `checkUsage`, then `logUsage`.
   - This creates separate Redis interactions for quota check and usage logging.

3. Redis blocklist and CIDR lookups
   - IP checks use Redis sorted sets, hashes, and pipelines.
   - These are fast, but still network round trips per request.

4. Disposable email domain lookup
   - `emailDisposableCheck` currently loads all disposable domains with
     `SMEMBERS` and creates a `Set` per request.
   - This is a strong optimization candidate.

5. DNS, MX, RDAP, WHOIS, and HTTPS checks
   - Domain checks call network services and use Redis caching.
   - Cache misses will dominate latency regardless of Node.js or Go.

## Expected Impact Of Go

Potential gains:

- Higher raw HTTP handler throughput.
- Lower memory footprint per process.
- Better behavior under very high concurrency.
- Simpler CPU parallelism for CPU-heavy work.

Limited gains:

- Redis, MySQL, DNS, RDAP, WHOIS, and outbound HTTPS latency will not get much
  faster from a language rewrite.
- Cache-miss request latency will still be dominated by external services.
- Current fraud checks do not look CPU-heavy enough to justify a rewrite on CPU
  grounds alone.

Net assessment: Go could make the service more efficient, but the current
evidence points to I/O costs as the main performance ceiling.

## Lower-Risk Improvements First

1. Replace per-request disposable-domain `SMEMBERS`.
   - Use `SISMEMBER disposable_emails <domain>`, or load the set into process
     memory with periodic refresh.

2. Cache API-key lookups.
   - Use Redis or in-process TTL caching for valid API keys and disabled status.
   - Keep TTL short enough that disabling a key propagates quickly.

3. Combine quota check and usage logging.
   - Replace separate `GET` plus pipeline flow with a single Lua script or
     tighter pipeline.

4. Add latency metrics by check.
   - Track p50, p95, and p99 for middleware and each fraud check.
   - Separate cache hits from cache misses for domain lookups.

5. Benchmark the current service.
   - Use representative request mixes: known providers, custom domains, IP-only
     checks, cache hits, and cache misses.
   - Measure event-loop delay, CPU, Redis latency, MySQL latency, and outbound
     DNS/RDAP/HTTPS timing.

6. Scale Node horizontally before rewriting.
   - Run multiple Node workers/processes if CPU or event-loop saturation appears.

## Decision Criteria For A Go Rewrite

Consider a Go rewrite only if measurement shows one or more of these:

- Node event-loop delay is a major contributor to p95 or p99 latency.
- CPU saturation happens before Redis/MySQL/network dependencies saturate.
- Memory pressure limits horizontal scaling.
- The API needs much higher sustained concurrency than the Node service can
  handle after the lower-risk optimizations above.
- Maintaining the Go service would not slow product iteration or duplicate too
  much shared JavaScript package logic.

## Conclusion

A Go rewrite may improve infrastructure efficiency, but it should not be the
first performance move. The better path is to benchmark, optimize Redis/MySQL
round trips, remove the `SMEMBERS` hot-path issue, and add per-check latency
metrics. Revisit Go only after those changes show that Node.js itself is the
remaining bottleneck.
