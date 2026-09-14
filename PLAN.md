# Gatekeepr Next Steps: Provider Intelligence, Domain Reliability, and Open Source

## Summary
- Add [`Kikobeats/free-email-domains`](https://github.com/Kikobeats/free-email-domains) as free-provider intelligence, not as a disposable-domain blocklist. Based on that repo's description/example, it classifies public providers like `gmail.com`, so it fits `trust` and provider metadata better than `email_disposable`.
- Rework domain age/registration logic so "registered but missing expiry" is a supported state instead of a buggy edge case. Your large domain list should be used first as a regression/evaluation corpus, not as production truth.
- Opening the full monorepo makes sense given the lack of paying traction, but the goal should be distribution, trust, and contributor input, not immediate monetization. Publish the code after cleanup; keep production workflows out of the public repo.

## Key Changes
- Email/provider intelligence:
  - Replace the hardcoded provider map with a generated provider dataset that merges your curated provider aliases with `free-email-domains`.
  - Expose provider facts in output: `info.email_known_provider` and `trust` including `email_free_provider`.
  - Do not mark free providers as risky and do not mix them into `email_disposable`.
  - Fix the current provider-bypass bug so domain checks consistently key off `email_known_provider`.

- Domain reliability:
  - Split domain evaluation into separate concepts: `registered/unregistered/unknown` and `expiry_known/expiry_unknown`.
  - Treat "registered but no expiry returned" as `registered + expiry_unknown`, not as `domain_unregistered`.
  - Add a corpus runner that takes a raw domain list, executes current RDAP/WHOIS/DNS logic, stores results, and buckets failures for review.
  - Promote recurring failure cases from the corpus into regression fixtures and a small curated edge-case suite.

- Open-source readiness:
  - Make the monorepo public only after removing self-hosted production workflows and secret-writing steps; keep setup docs public.
  - Add `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`, and a public-facing architecture/setup README.
  - Audit all third-party lists used by cron jobs and document provenance/license compatibility before publishing.
  - Parameterize or remove hardcoded internal values such as admin emails, local Redis host assumptions, and production-only branch workflows.

## Public Interface Changes
- Keep `GET /`, `POST /ping`, and `POST /` unchanged.
- Extend response metadata only:
  - `trust` may include `email_free_provider`.
  - `info` should include provider and domain-status fields such as `email_known_provider`, `domain_registration_status`, and `domain_expiry_known`.
- Do not change `email_disposable` semantics.

## Test Plan
- Provider tests: `gmail.com`, `yahoo.com`, `proton.me` become trusted public providers; disposable domains remain threats; overlap favors `email_disposable`.
- Domain tests: registered domains with missing expiry, unregistered domains, expired domains, WHOIS/RDAP failures, and DNS-only-but-no-expiry cases.
- Regression harness: run the raw domain corpus, snapshot outcomes, and turn reviewed failures into stable fixtures.
- OSS checks: public CI must run install, API tests, lint, and build without any private infrastructure.

## Assumptions
- `free-email-domains` is used as provider/trust data, not abuse data.
- Your large domain corpus is raw domains only, with no labels.
- The full monorepo will become public, but production deployment workflows will be removed from the public repository first.
- License choice remains undecided and should be finalized immediately before publication.
