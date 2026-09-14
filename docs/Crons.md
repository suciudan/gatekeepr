# Crons

Dataset publishing is disabled by default. Refreshing local data does not authorize publishing: set the corresponding `DISPOSABLE_PUBLISH_ENABLED`, `BROWSER_VERSIONS_PUBLISH_ENABLED`, or `DISPOSABLE_INFRASTRUCTURE_PUBLISH_ENABLED` to the exact value `true` only after configuring your own destination repository and credentials. Keep these flags `false` for normal development.

Create the cron log directory:

```shell
mkdir /root/cron-logs
```

Open the crontab editor:

```shell
crontab -e
```

Paste the following crons:

```shell
CRON_TZ=UTC

# Check the RPM to reset every minute
* * * * * cd /root/monorepo/apps/crons && /usr/bin/node src/reset-rpm.js >> /root/cron-logs/reset-rpm.log 2>&1

# Refresh the disposable domains once a day at 00:00.
# This updates disposable-domain membership plus metadata enrichment and, when configured, publishes the package/repo artifacts.
0 0 * * * cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-disposable-emails.js >> /root/cron-logs/disposable-emails.log 2>&1

# Refresh disposable MX infrastructure snapshots once a day at 02:00.
0 2 * * * cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-disposable-mx.js >> /root/cron-logs/disposable-mx.log 2>&1

# Refresh MX/IP snapshots for all active disposable domains using the local recursive DNS cache,
# then publish the public disposable-email-infrastructure repo if artifacts changed.
# See docs/RecursiveResolver.md before enabling this in production.
0 3 * * * cd /root/monorepo/apps/crons && DISPOSABLE_DNS_SERVERS=127.0.0.1:5353 /usr/bin/node src/refresh-disposable-mx-all.js --publish >> /root/cron-logs/disposable-mx-all.log 2>&1

# Publish the disposable email infrastructure dataset once a day at 10:00.
0 10 * * * cd /root/monorepo/apps/crons && DISPOSABLE_INFRASTRUCTURE_OUTPUT_DIR=/tmp/disposable-email-infrastructure DISPOSABLE_INFRASTRUCTURE_DNS_SERVERS=127.0.0.1:5353 /usr/bin/node src/publish-disposable-infrastructure.js --all >> /root/cron-logs/disposable-infrastructure.log 2>&1

# Refresh the Tor exit nodes every 35 minutes
*/35 * * * * cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-tor-exit-nodes.js >> /root/cron-logs/tor-exit-nodes.log 2>&1

# Refresh the ASN owners twice a day (11:00 and 23:00)
0 11,23 * * * cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-asn.js >> /root/cron-logs/asn.log 2>&1

# Refresh the Spamhaus IPv4 DROP list twice a day (11:15 and 23:15)
15 11,23 * * * cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-spamhaus.js ipv4 >> /root/cron-logs/spamhaus-ipv4.log 2>&1

# Refresh the Spamhaus IPv6 DROP list twice a day (11:30 and 23:30)
30 11,23 * * * cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-spamhaus.js ipv6 >> /root/cron-logs/spamhaus-ipv6.log 2>&1

# Refresh the iCloud Relay list twice a day (11:45 and 23:45)
45 11,23 * * * cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-icloud-relay.js >> /root/cron-logs/icloud-relay.log 2>&1

# Refresh the Blocklist UA every 20 minutes
*/20 * * * * cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-blocklist-ua.js ipv6 >> /root/cron-logs/blocklist-ua.log 2>&1

# Refresh the AWS Ranges list once a day (21:00)
0 21 * * * cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-aws.js >> /root/cron-logs/aws.log 2>&1

# Refresh Cloudflare once a day (22:00)
0 22 * * * cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-cloudflare.js >> /root/cron-logs/cloudflare.log 2>&1

# Refresh browser versions once a day (22:30)
30 22 * * * cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-browser-versions.js >> /root/cron-logs/browser-versions.log 2>&1
```

## Disposable Dataset Env

The disposable refresh job supports these extra environment variables:

- `DISPOSABLE_ENRICH_CONCURRENCY`: concurrent WHOIS/RDAP jobs per batch.
- `DISPOSABLE_ENRICH_DELAY_MS`: delay between enrichment batches in milliseconds.
- `DISPOSABLE_ENRICH_BATCH_SIZE`: optional cap for how many due enrichments are processed in one run. `0` means no cap.
- `DISPOSABLE_BACKFILL_CONCURRENCY`: concurrent WHOIS/RDAP jobs for the manual backfill command.
- `DISPOSABLE_BACKFILL_DELAY_MS`: delay between manual backfill slices/batches in milliseconds.
- `DISPOSABLE_BACKFILL_BATCH_SIZE`: number of domains persisted per manual backfill batch.
- `DISPOSABLE_BACKFILL_LIMIT`: optional cap for one manual backfill run. `0` means no cap.
- `DISPOSABLE_BACKFILL_EXPORT`: set to `true` to regenerate the preview export after a manual backfill run.
- `DISPOSABLE_BACKFILL_SHARD_COUNT`: split a full backfill into N stable shards.
- `DISPOSABLE_BACKFILL_SHARD_INDEX`: the zero-based shard index to process for the current run.
- `DISPOSABLE_BACKFILL_MX_MAX_AGE_MS`: maximum age for reusing an existing MX IP snapshot before it is refreshed.
- `DISPOSABLE_BACKFILL_MX_CONCURRENCY`: concurrent MX hostname IP resolutions per domain snapshot.
- `DISPOSABLE_MX_REFRESH_CONCURRENCY`: concurrent domain MX snapshot refresh jobs in the dedicated MX refresh worker.
- `DISPOSABLE_MX_REFRESH_BATCH_SIZE`: number of domains persisted per dedicated MX refresh batch.
- `DISPOSABLE_MX_REFRESH_DELAY_MS`: delay between dedicated MX refresh slices/batches in milliseconds.
- `DISPOSABLE_MX_REFRESH_LIMIT`: optional cap for one dedicated MX refresh run. `0` means no cap.
- `DISPOSABLE_MX_REFRESH_RESOLVE_CONCURRENCY`: concurrent MX host IP resolutions inside a single domain snapshot refresh.
- `DISPOSABLE_MX_FULL_REFRESH_CONCURRENCY`: concurrent domain MX/IP jobs in the full disposable-domain MX refresh worker.
- `DISPOSABLE_MX_FULL_REFRESH_BATCH_SIZE`: number of domains persisted per full MX/IP refresh batch.
- `DISPOSABLE_MX_FULL_REFRESH_DELAY_MS`: delay between full MX/IP refresh batches in milliseconds.
- `DISPOSABLE_MX_FULL_REFRESH_LIMIT`: optional cap for one full MX/IP refresh run. `0` means no cap.
- `DISPOSABLE_MX_FULL_REFRESH_RESOLVE_CONCURRENCY`: concurrent MX host IP resolutions inside a single domain snapshot refresh.
- `DISPOSABLE_MX_FULL_REFRESH_SHARD_COUNT`: split a full MX/IP refresh into N stable shards.
- `DISPOSABLE_MX_FULL_REFRESH_SHARD_INDEX`: the zero-based shard index to process for the current full MX/IP refresh worker.
- `DISPOSABLE_MX_FULL_REFRESH_PUBLISH`: set to `true` to publish the public disposable-email-infrastructure repo after the full MX/IP refresh completes. Equivalent to passing `--publish`.
- `DISPOSABLE_DNS_SERVERS`: comma-separated DNS resolver list for MX/IP refresh jobs. Use `127.0.0.1:5353` with the local Unbound resolver described in `docs/RecursiveResolver.md`.
- `DISPOSABLE_RDAP_TIMEOUT_MS`: timeout for RDAP bootstrap/lookups in milliseconds.
- `DISPOSABLE_WHOIS_TIMEOUT_MS`: timeout for WHOIS fallback lookups in milliseconds.
- `DISPOSABLE_MX_TIMEOUT_MS`: timeout for MX lookups and DNS-over-HTTPS MX fallback in milliseconds.
- `DISPOSABLE_IP_TIMEOUT_MS`: timeout for resolving MX host IPv4/IPv6 addresses in milliseconds.
- `DISPOSABLE_PUBLISH_ENABLED`: set to the exact value `true` to publish the generated package when artifacts change. Defaults to disabled.
- `DISPOSABLE_PUBLISH_REPO`: GitHub repository slug for the public package repo.
- `DISPOSABLE_PUBLISH_BRANCH`: target branch in the public package repo.
- `DISPOSABLE_PUBLISH_GITHUB_TOKEN`: token used to push commits and tags to the public repo.
- `DISPOSABLE_PUBLISH_NPM_TOKEN`: token used for `npm publish`.
- `DISPOSABLE_PUBLISH_GIT_NAME`: git author name for automated commits.
- `DISPOSABLE_PUBLISH_GIT_EMAIL`: git author email for automated commits.

## Disposable Infrastructure Publisher Env

The disposable infrastructure publisher fetches the latest public `email-disposable` dataset, builds enriched domain/provider/MX/IP artifacts, and publishes them to the public `disposable-email-infrastructure` repo.

- `DISPOSABLE_INFRASTRUCTURE_SOURCE_URL`: source dataset URL. Defaults to `https://raw.githubusercontent.com/gtkppr/email-disposable/refs/heads/main/disposable.json`.
- `DISPOSABLE_INFRASTRUCTURE_SOURCE_PACKAGE_URL`: source package metadata URL. Defaults to `https://raw.githubusercontent.com/gtkppr/email-disposable/refs/heads/main/package.json`.
- `DISPOSABLE_INFRASTRUCTURE_PUBLISH_ENABLED`: set to `true` to push generated artifacts. Defaults to disabled.
- `DISPOSABLE_INFRASTRUCTURE_PUBLISH_REPO`: destination GitHub repo slug. Required when publishing is enabled.
- `DISPOSABLE_INFRASTRUCTURE_PUBLISH_BRANCH`: destination branch. Defaults to `main`.
- `DISPOSABLE_INFRASTRUCTURE_GITHUB_TOKEN`: token with push access to the destination repo.
- `DISPOSABLE_INFRASTRUCTURE_GIT_NAME`: git author name for automated commits.
- `DISPOSABLE_INFRASTRUCTURE_GIT_EMAIL`: git author email for automated commits.
- `DISPOSABLE_INFRASTRUCTURE_OUTPUT_DIR`: optional local mirror of the generated repository contents. Publishing commits and pushes only when `DISPOSABLE_INFRASTRUCTURE_PUBLISH_ENABLED=true` and `DISPOSABLE_INFRASTRUCTURE_GITHUB_TOKEN` is set.
- `DISPOSABLE_INFRASTRUCTURE_DNS_SERVERS`: comma-separated DNS resolver list for MX/IP enrichment. Use `127.0.0.1:5353` with the local Unbound resolver described in `docs/RecursiveResolver.md`.
- `DISPOSABLE_INFRASTRUCTURE_MX_REFRESH_LIMIT`: maximum missing MX/IP snapshots to refresh in one publisher run. `0` disables refresh.
- `DISPOSABLE_INFRASTRUCTURE_MX_REFRESH_CONCURRENCY`: concurrent domain MX snapshot refresh jobs.
- `DISPOSABLE_INFRASTRUCTURE_MX_RESOLVE_CONCURRENCY`: concurrent MX host IP resolutions inside a domain snapshot refresh.
- `DISPOSABLE_INFRASTRUCTURE_MX_TIMEOUT_MS`: timeout for MX lookups in milliseconds.
- `DISPOSABLE_INFRASTRUCTURE_IP_TIMEOUT_MS`: timeout for MX host IPv4/IPv6 lookups in milliseconds.
- `DISPOSABLE_INFRASTRUCTURE_PREWARM_ENABLED`: set to `false` to skip site page prewarming after a successful publish.
- `DISPOSABLE_INFRASTRUCTURE_PREWARM_BASE_URL`: site origin used for default prewarm URLs. Defaults to `http://localhost:9999`.
- `DISPOSABLE_INFRASTRUCTURE_PREWARM_TOP_PROVIDERS`: number of top provider detail pages to prewarm after publishing. Defaults to `10`; set to `0` to prewarm only the list page and custom URLs.
- `DISPOSABLE_INFRASTRUCTURE_PREWARM_TIMEOUT_MS`: per-request prewarm timeout in milliseconds.
- `DISPOSABLE_INFRASTRUCTURE_PREWARM_URLS`: optional comma-separated additional absolute URLs to prewarm.

The publisher also writes a site-ready provider index and one provider-detail cache entry per provider into Redis. The site uses those compact generated caches for `/disposable-email-data` and `/disposable-email-data/:slug` before falling back to rebuilding provider data from individual disposable profiles.

For Cloudflare edge caching, add a Cache Rule that marks `https://gatekeepr.io/disposable-email-data*` as eligible for cache with an Edge TTL of `1 hour`, and include query string in the cache key for filtered pages.

## Browser Version Dataset Env

The browser-version refresh job supports these extra environment variables:

- `BROWSER_VERSIONS_PUBLISH_ENABLED`: set to the exact value `true` to publish to GitHub. Defaults to disabled.
- `BROWSER_VERSIONS_PUBLISH_REPO`: GitHub repository slug for the public browser-version dataset.
- `BROWSER_VERSIONS_PUBLISH_BRANCH`: target branch in the public dataset repo.
- `BROWSER_VERSIONS_PUBLISH_GITHUB_TOKEN`: token used to push commits to the public repo.
- `BROWSER_VERSIONS_PUBLISH_GIT_NAME`: git author name for automated commits.
- `BROWSER_VERSIONS_PUBLISH_GIT_EMAIL`: git author email for automated commits.
- `BROWSER_VERSIONS_PACKAGE_NAME`: optional package name written into the generated GitHub repo package metadata.

The browser-version publisher writes a package-style GitHub repo with `browser-versions.json`, `browser-versions.min.json`,
`browser-versions.txt`, `index.js`, `README.md`, and `package.json`. The JSON includes explicit `currentVersion` and
`sources.currentVersion` metadata for current-version provenance. Vendor EOL source fields remain `null` unless a real
vendor or lifecycle source is configured. Gatekeepr's outdated/unsupported decisions are documented separately as an
internal major-version lag assessment policy. When data changes, it bumps the package patch version, commits the generated
files, tags the version, and pushes the target branch.

Use this command to verify the browser-version publish pipeline without pushing:

An explicit `--dry-run` works while publishing is disabled. For browser versions and disposable domains it still clones the configured repository and runs `npm pack --dry-run`, so it requires network access and a valid destination. It does not push commits/tags or publish an npm package.

```shell
cd /root/monorepo/apps/crons && /usr/bin/node src/publish-browser-versions.js --dry-run
```

Use this command to verify the publish pipeline without pushing or publishing:

```shell
cd /root/monorepo/apps/crons && /usr/bin/node src/publish-disposable-domains.js --dry-run
```

Use this command to verify the disposable infrastructure publisher without pushing:

```shell
cd /root/monorepo/apps/crons && DISPOSABLE_INFRASTRUCTURE_DNS_SERVERS=127.0.0.1:5353 /usr/bin/node src/publish-disposable-infrastructure.js --dry-run
```

Use this command to backfill disposable-domain enrichment locally or on the cron host:

```shell
cd /root/monorepo/apps/crons && /usr/bin/node src/backfill-disposable-domains.js --export
```

Use `--all` for a full re-enrichment sweep of every active disposable domain. The command stores a Redis cursor after each saved batch so `--all` runs can resume safely after interruption. Use `--reset` to clear that cursor and restart the sweep from the beginning.

The manual backfill now refreshes domain metadata first, then only re-resolves MX IP snapshots when the MX records changed, the snapshot is missing, or the existing snapshot is older than `DISPOSABLE_BACKFILL_MX_MAX_AGE_MS`. Full sweeps can be parallelized with shard flags such as:

```shell
cd /root/monorepo/apps/crons && /usr/bin/node src/backfill-disposable-domains.js --all --shard-count=4 --shard-index=0
```

To process only the queued MX snapshot work, run:

```shell
cd /root/monorepo/apps/crons && /usr/bin/node src/refresh-disposable-mx.js
```

To refresh MX/IP snapshots for every active disposable domain without RDAP/WHOIS enrichment, run:

```shell
cd /root/monorepo/apps/crons && DISPOSABLE_DNS_SERVERS=127.0.0.1:5353 /usr/bin/node src/refresh-disposable-mx-all.js --reset --batch-size=500 --concurrency=25 --mx-concurrency=10
```

To refresh every active disposable domain and publish the public infrastructure dataset immediately after the refresh, run:

```shell
cd /root/monorepo/apps/crons && DISPOSABLE_DNS_SERVERS=127.0.0.1:5353 /usr/bin/node src/refresh-disposable-mx-all.js --reset --publish --batch-size=500 --concurrency=25 --mx-concurrency=10
```

Set up the local resolver first using `docs/RecursiveResolver.md`.

Disposable-domain profiles and refresh schedules now live durably in MySQL. Redis is kept as a rebuildable cache for lookup sets, cached profiles, due queues, and MX infrastructure indexes. If Redis is lost or restarted, rebuild those disposable caches with:

```shell
cd /root/monorepo/apps/crons && /usr/bin/node src/rebuild-disposable-redis-cache.js
```
