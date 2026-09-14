# Disposable MX Infrastructure Confidence

## Summary

Improve the disposable MX infrastructure check by storing evidence metadata,
assigning confidence levels, suppressing known shared providers, and publishing a
clean public dataset. The goal is to keep the current detection value while
reducing false positives from shared hosted email infrastructure.

## Current Behavior

- `apps/crons/src/refresh-disposable-mx.js` refreshes MX records for disposable
  domains and stores resolved MX host IP snapshots.
- `apps/crons/src/libs/disposable-emails.js` rebuilds Redis sets for disposable
  MX hosts, IPv4 addresses, and IPv6 addresses.
- `apps/api/src/checks/domain/mxCheck.js` resolves a submitted email domain's MX
  infrastructure and raises `domain_mx_disposable_infra` when any MX hostname or
  resolved IP appears in the disposable infrastructure sets.

This is useful, but the current set-based model treats all matches equally.
Shared mail providers can cause noisy IP matches because many unrelated domains
can route through the same hosted infrastructure.

## Key Improvements

1. Store MX infrastructure metadata instead of only flat Redis sets.
   Track evidence such as value type, disposable domain count, sample domains,
   first seen timestamp, last seen timestamp, last resolved timestamp, and source
   profile count.

2. Add confidence levels to disposable infrastructure matches.
   Use high confidence for exact disposable MX hostname matches, medium
   confidence for IPs reused by multiple disposable domains, low confidence for
   weak single-domain IP overlap, and ignored/suppressed confidence for known
   shared providers.

3. Suppress known shared mail infrastructure.
   Maintain a provider allowlist or suppression table for Google Workspace,
   Microsoft 365/Outlook, Zoho, Fastmail, Proton, Mailgun, SendGrid, Amazon SES,
   and similar providers. Keep suppressed matches in `info` for transparency,
   but avoid raising a blocking threat from them by default.

4. Add staleness controls when rebuilding indexes.
   Exclude `mxResolvedRecords` older than a configured max age, such as 7 to 14
   days, from live Redis matching indexes. Keep stale data in persisted profiles
   for history, but do not use it as current enforcement evidence.

5. Track infrastructure drift over time.
   Preserve enough history to identify when a disposable domain changes MX host,
   moves to a new IP range, or when an MX IP suddenly starts serving many
   disposable domains. This can become a separate intelligence signal.

6. Return richer API evidence.
   Replace the binary-only result with structured metadata such as confidence,
   matched hosts, matched IPv4s, matched IPv6s, suppressed providers, disposable
   domain counts, and reason text.

7. Publish the dataset publicly.
   Generate public artifacts for disposable MX hosts, disposable MX IPv4s,
   disposable MX IPv6s, and a combined infrastructure metadata file. Publish
   counts, confidence, timestamps, and provider classification. Avoid publishing
   unnecessarily large domain sample lists.

## Proposed Data Shape

```json
{
	"value": "203.0.113.10",
	"type": "ipv4",
	"confidence": "medium",
	"disposableDomainCount": 37,
	"sampleDomains": ["example-disposable.test", "mail-temp.test"],
	"provider": null,
	"suppressed": false,
	"firstSeenAt": "2026-04-01T00:00:00.000Z",
	"lastSeenAt": "2026-04-30T00:00:00.000Z",
	"lastResolvedAt": "2026-04-30T00:00:00.000Z"
}
```

## API Behavior

- Keep `domain_mx_disposable_infra` for strong matches.
- Add `info.domain_mx_disposable_evidence` for all matches, including suppressed
  matches.
- Suggested behavior:
  - High confidence: block.
  - Medium confidence: block or challenge depending on product policy.
  - Low confidence: expose as `info` or challenge only.
  - Suppressed shared provider: expose as `info`, do not block.

Example response metadata:

```json
{
	"confidence": "medium",
	"matchedHosts": [],
	"matchedIpv4": ["203.0.113.10"],
	"matchedIpv6": [],
	"disposableDomainCount": 12,
	"suppressed": false,
	"reason": "MX IP reused by multiple disposable domains"
}
```

## Public Artifacts

- `disposable-mx-hosts.json`
- `disposable-mx-ipv4.json`
- `disposable-mx-ipv6.json`
- `disposable-mx-infra.json`

Each artifact should be generated from active disposable profiles and omit stale
resolved IP evidence from the live enforcement view.

## Implementation Notes

- Extend `createDisposableMxIndexData()` to produce both flat compatibility sets
  and richer metadata maps.
- Keep existing Redis sets during migration so current API checks continue to
  work.
- Add new Redis JSON or hash keys for metadata lookups by host/IP value.
- Add a configurable minimum disposable-domain count before IP matches can raise
  a blocking threat.
- Add a configurable staleness window for resolved MX IP snapshots.
- Add provider classification through MX hostname patterns first, then ASN/IP
  ownership if needed.
- Keep hostname matches stronger than IP matches because hostnames are less
  likely to be shared accidentally.

## Test Plan

- Unit-test metadata generation from disposable profiles.
- Verify stale `mxResolvedRecords` are excluded from live indexes.
- Verify removed disposable domains are excluded from metadata and indexes.
- Verify exact MX hostname matches produce high confidence.
- Verify single-domain IP overlap produces low confidence.
- Verify multi-domain IP overlap reaches medium confidence.
- Verify known shared providers are suppressed and do not block.
- Verify API response includes structured evidence.
- Verify public artifact generation is stable and sorted.
- Run `yarn workspace api test`.

## Assumptions

- Existing `domain_mx_disposable_infra` behavior should remain compatible while
  richer evidence is introduced.
- MX IP overlap alone should not be treated as equally strong as MX hostname
  overlap.
- Public artifacts should prioritize useful aggregate intelligence over raw,
  noisy, high-volume samples.
