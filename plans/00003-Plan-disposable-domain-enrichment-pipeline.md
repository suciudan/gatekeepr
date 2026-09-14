# Disposable Domain Enrichment, Tooling, and Publish Pipeline

## Summary

- Extend the daily disposable-domain refresh so it stays the source of truth for the existing `disposable_emails` Redis set, then immediately enrich first-seen domains and re-enrich known domains only when they are at least 7 days stale.
- Store a current public snapshot of the IPs behind each enriched MX host so future provider attribution can use both MX hostnames and MX infrastructure evidence.
- Reuse that active MX hostname/IP dataset inside the API domain MX verification so domains that route mail through disposable-provider infrastructure can be blocked even when the exact domain is not on the disposable list.
- Reuse the existing shared WHOIS/RDAP logic in `packages/core/src/whois.js`; do not do live WHOIS/RDAP lookups from the site.
- Make `/tools/disposable-domain-detector` the canonical public tool page, backed by Redis enrichment data. Keep the current `/tools/disposable-email-checker` route as a redirect or thin alias to avoid duplicate maintenance.
- Publish from the cron host directly to `gtkppr/email-disposable` and npm, but only when generated package contents change.

## Key Changes

- Refactor `apps/crons/src/refresh-disposable-emails.js` into an orchestrator with two stages: raw source aggregation and enrichment scheduling/execution.
- Add a per-domain Redis JSON document keyed by domain. Persist only structured fields, not raw RDAP/WHOIS payloads.
- The profile shape should include: `domain`, `isDisposable`, `firstSeenAt`, `lastSeenAt`, `removedAt`, `lastEnrichedAt`, `lastEnrichmentError`, `nextEnrichmentAt`, `creation`, `expiration`, `owner`, `status`, `mxRecords`, `mxResolvedAt`, and `mxResolvedRecords`.
- Keep `mxRecords` as MX hostname + priority only. Store MX IP data separately as a current snapshot per host so infrastructure evidence does not replace the DNS record model.
- Add active Redis indexes for disposable MX hostnames, disposable MX IPv4s, and disposable MX IPv6s. Rebuild those indexes from active profiles after refresh/backfill so removed domains automatically drop out of API matching.
- Add a Redis sorted set for due work so the cron can fetch only enrichment jobs whose `nextEnrichmentAt <= now` instead of rescanning all domains each run.
- Scheduling policy:
  - New domain: enrich on the same daily run it first appears.
  - Existing domain: re-enrich once every 7 days.
  - Failed enrichment: keep the profile and retry the next daily run instead of waiting another week.
  - Removed domain: mark inactive with `isDisposable=false` and `removedAt`, exclude from public exports, but keep history so reappearing domains do not lose `firstSeenAt`.
- Rate-limit the enrich step with explicit env-controlled concurrency and delay knobs on the cron host, defaulting to a conservative setting.
- Add a site lookup path that accepts either a full email or a bare domain, normalizes to the domain, checks current disposable membership, and returns one of three states: `disposable with enrichment`, `disposable but enrichment pending/error`, or `not currently disposable`.
- Extend the API domain MX check so it resolves MX hosts plus MX host IPs, compares both against the active disposable MX indexes, and raises a new blocking threat when it finds overlap with disposable infrastructure.
- Keep `email_disposable` as the exact-domain disposable signal. Treat the MX infrastructure match as a separate domain-layer verification with its own response metadata for matched hosts/IPs.
- Create `/tools/disposable-domain-detector` as the public UI and update header/footer/sitemap to point to it.
- Preserve the current `email-disposable` package interface:
  - Keep `disposable.txt` and `disposable.json` as the flat current-domain list.
  - Add a new public companion artifact `disposable-extended.json`, keyed by domain, containing the public enrichment fields including `owner`, `mxRecords`, `mxResolvedAt`, and `mxResolvedRecords`.
  - Keep the existing default `isDisposable(...)` behavior unchanged.
  - Add one non-breaking named export for the enriched lookup map, for example `domainProfiles`.
- Add a publisher script that clones `gtkppr/email-disposable` into a temp working directory on each changed run, writes the generated files, updates `README.md` usage for the new enriched artifact/export, bumps the package patch version, commits, tags, pushes, and runs `npm publish`.
- Skip commit/tag/publish entirely when the generated package files are byte-identical to the repo's current contents.
- Update cron deployment config so the host receives the new publish and throttling secrets through `apps/crons/.env.prod`, and document the extra env vars in the cron runbook.
- Update the official docs to explain the new MX infrastructure verification, the new blocking threat, and the difference between exact disposable-domain detection and disposable-provider detection through MX routing.
- Reuse the existing open Plane item `The "Free Dataset" Hack` for implementation and fold the site-route work into that same task instead of creating a second active implementation item.

## Public Interfaces

- Redis adds a new disposable-domain profile document per domain plus one due-index sorted set; public profiles include both MX hostnames and a current resolved MX IP snapshot. API-side Redis also gains active disposable MX hostname/IP indexes used during request-time domain verification.
- API adds a new blocking threat for MX overlap with disposable infrastructure plus response metadata describing matched MX hosts/IPs.
- Site adds a new canonical tool route: `/tools/disposable-domain-detector`.
- NPM/GitHub package adds `disposable-extended.json` and a new named export for enriched profiles; existing flat-list files and current default check API remain intact.

## Test Plan

- Add Mocha coverage for pure scheduling/profile/export helpers:
  - first-seen domains are enriched immediately
  - stale domains are re-enriched only after 7 days
  - failed enrichments retry on the next daily run
  - removed domains are excluded from public exports but retain history
  - MX IP snapshots are normalized, deduplicated, and exported separately from MX records
  - active disposable MX host/IP indexes exclude removed domains
  - publish serialization preserves existing flat-list outputs and produces the keyed enriched profile artifact
- Add API coverage for:
  - exact-domain disposable detection still works independently
  - MX hostname overlap triggers the new blocking threat
  - MX IP overlap triggers the new blocking threat
  - known providers still skip domain MX verification
  - removed disposable domains stop matching after index rebuild
- Add site-level coverage for domain normalization and the three UI result states.
- Run `yarn workspace api test`.
- Run `yarn workspace site build`.
- Verify the publisher with a dry-run mode that performs generation, repo diffing, version bump calculation, and npm packing without pushing or publishing.

## Assumptions

- `/tools/disposable-domain-detector` replaces the old checker as the primary tools surface; the old checker route stays only for backward compatibility.
- Owner data is intentionally public in the repo/package/site output when it is available and not redacted by the existing WHOIS/RDAP sanitization.
- MX IP snapshots are intentionally public, but they are current evidence only and should not be treated as durable provider identity by themselves.
- The new API MX infrastructure signal is intentionally blocking and uses only the current active disposable MX indexes, not removed-domain history.
- The cron host is allowed to hold a GitHub token and npm token and is the only place that will publish the external repo/package.
- Versioning is patch-only and only happens when the generated package contents actually change.
