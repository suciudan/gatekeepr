# Redis

Gatekeepr uses Redis for cached intelligence, CIDR indexes, usage counters, and JSON documents. The shared client calls `JSON.GET` and `JSON.SET`, so a server that only implements Redis string/set/hash commands is insufficient. Install a Redis distribution with JSON support and verify those commands before running the API or crons. See the [official Redis JSON documentation](https://redis.io/docs/latest/develop/data-types/json/).

The default connection is local Redis at `127.0.0.1:6379`. Set `REDIS_URL` in the app's environment file to change the host, port, database, credentials, or TLS configuration. For example, a local development database can use:

```dotenv
REDIS_URL=redis://127.0.0.1:6379/0
```

Use the same Redis database for the API and its refresh jobs. Other database indexes can isolate separate development setups, provided the selected Redis service supports them. Keep credentials in ignored environment files.

With `redis-cli` configured for your local server, check:

```sh
redis-cli PING
redis-cli COMMAND INFO JSON.GET JSON.SET
```

The first command should return `PONG`; the second should return command metadata for both JSON commands. Missing entries or an `unknown command` response indicate that JSON support is unavailable. For a remote/authenticated service, use your client's supported connection configuration without putting real credentials into shared command transcripts.

Starting an empty Redis server does not populate threat intelligence. Review [Crons.md](Crons.md) and [DataSources.md](DataSources.md) before selecting refresh jobs. Disposable-domain profiles can be rebuilt from the MySQL store with `yarn workspace crons rebuild:disposable-cache`; other feed caches and usage counters need their own persistence or refresh strategy.

Use a dedicated local instance for development. Configure persistence, network access, authentication, and backups separately for any deployment; usage counters are application state, not merely an expendable cache.
