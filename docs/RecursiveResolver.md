# Local Recursive DNS Resolver

The disposable MX full refresh job can send a large number of DNS queries while resolving MX hosts to IP addresses. In production, run a local recursive resolver on the cron host and point the refresh job at it. This keeps repeated MX host lookups local after the first query and avoids concentrating all requests through a public resolver.

Use Unbound on loopback with a non-default port so it does not conflict with `systemd-resolved`, which commonly listens on `127.0.0.53:53` and `127.0.0.54:53` on Ubuntu.

## Install Unbound

```shell
sudo apt update
sudo apt install -y unbound dnsutils
```

Create `/etc/unbound/unbound.conf.d/gatekeepr.conf`:

```conf
server:
    interface: 127.0.0.1
    port: 5353

    access-control: 127.0.0.0/8 allow
    do-ip4: yes
    do-ip6: yes
    do-udp: yes
    do-tcp: yes

    num-threads: 4
    outgoing-range: 8192
    num-queries-per-thread: 4096

    msg-cache-size: 256m
    rrset-cache-size: 512m
    cache-min-ttl: 60
    cache-max-ttl: 86400
    prefetch: yes
    prefetch-key: yes

    hide-identity: yes
    hide-version: yes
    qname-minimisation: yes
    harden-glue: yes
    harden-dnssec-stripped: yes
```

Validate the config and start the service:

```shell
unbound-checkconf
systemctl enable --now unbound
systemctl restart unbound
systemctl status unbound
```

## Verify Resolution

Confirm Unbound is listening on loopback:

```shell
ss -lntup | grep ':5353'
```

Confirm recursive lookups work:

```shell
dig @127.0.0.1 -p 5353 MX gmail.com +short
dig @127.0.0.1 -p 5353 A gmail-smtp-in.l.google.com +short
```

Run the same query twice to confirm the second lookup is served from cache more quickly:

```shell
dig @127.0.0.1 -p 5353 MX gmail.com
dig @127.0.0.1 -p 5353 MX gmail.com
```

## Use With Disposable MX Refresh

Pass the resolver to the full MX refresh job with `DISPOSABLE_DNS_SERVERS`:

```shell
cd /root/monorepo/apps/crons
DISPOSABLE_DNS_SERVERS=127.0.0.1:5353 /usr/bin/node src/refresh-disposable-mx-all.js --reset --batch-size=500 --concurrency=25 --mx-concurrency=10
```

For crontab, include the environment variable inline:

```shell
# Full disposable MX/IP refresh using the local recursive DNS cache.
0 3 * * * cd /root/monorepo/apps/crons && DISPOSABLE_DNS_SERVERS=127.0.0.1:5353 /usr/bin/node src/refresh-disposable-mx-all.js >> /root/cron-logs/disposable-mx-all.log 2>&1
```

The job also supports these controls for production tuning:

- `DISPOSABLE_MX_FULL_REFRESH_CONCURRENCY`: concurrent domain refresh jobs.
- `DISPOSABLE_MX_FULL_REFRESH_RESOLVE_CONCURRENCY`: concurrent MX host IP resolutions inside each domain refresh.
- `DISPOSABLE_MX_FULL_REFRESH_BATCH_SIZE`: profiles saved per batch.
- `DISPOSABLE_MX_FULL_REFRESH_DELAY_MS`: delay between batches in milliseconds.
- `DISPOSABLE_MX_FULL_REFRESH_SHARD_COUNT`: split the domain set into stable shards.
- `DISPOSABLE_MX_FULL_REFRESH_SHARD_INDEX`: zero-based shard index for the current worker.
- `DISPOSABLE_MX_TIMEOUT_MS`: timeout for MX lookups.
- `DISPOSABLE_IP_TIMEOUT_MS`: timeout for MX host A/AAAA lookups.
- `DISPOSABLE_DNS_SERVERS`: comma-separated DNS server list. Use `127.0.0.1:5353` for the local Unbound instance.

## Operational Notes

- Keep Unbound bound to loopback unless the server is intentionally providing DNS to private hosts. Do not expose an open recursive resolver to the public internet.
- The cron job has its own per-run MX hostname address cache. Unbound adds a durable DNS cache beneath that, which helps across repeated runs and process restarts.
- Start with conservative concurrency and raise it after checking resolver CPU, memory, and upstream DNS error rates.
- Use `--reset` only when starting a new full sweep from the beginning. Without `--reset`, the job resumes from its Redis cursor after each saved batch.
- If running multiple workers, assign each one a unique `DISPOSABLE_MX_FULL_REFRESH_SHARD_INDEX` from `0` to `DISPOSABLE_MX_FULL_REFRESH_SHARD_COUNT - 1`.
