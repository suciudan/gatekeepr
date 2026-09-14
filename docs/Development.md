# Local development

Use this guide to work on the parts of Gatekeepr relevant to your change. Commands assume a POSIX shell on Linux/macOS or WSL, run from the repository root unless stated otherwise. Install Node and Yarn inside the same environment; do not share a `node_modules` directory between Windows and WSL.

## Install and test

Use [Node.js 24 LTS and Yarn 4.9.2](Node.md):

```sh
corepack enable
yarn install --immutable
yarn workspace api test
```

The API and JavaScript integration unit suites use controlled dependencies. They do not require a copy of the original service's data. See [CONTRIBUTING.md](../CONTRIBUTING.md) for all focused test commands. Installing the whole workspace may build native dependencies such as `sharp` and `better-sqlite3`; a platform without a matching prebuilt binary needs the corresponding compiler/build tools.

Start individual apps as needed. `yarn dev` starts multiple workspace tasks and requires more configuration than the API alone. Quota resets are an explicit operator task: `yarn workspace crons reset:usage:daily`.

## Services and environment files

| Component | Runtime requirements | Environment example |
| --- | --- | --- |
| API | MySQL, Redis with JSON commands, outbound DNS/HTTPS and some WHOIS lookups | `apps/api/.env.sample` → `apps/api/.env.local` |
| Crons | MySQL, the same Redis as the API, network access to selected feeds | `apps/crons/.env.sample` → `apps/crons/.env.local` |
| Public site | MySQL/Redis for account and dataset features; CMS for published content; optional mail/Turnstile services | `apps/site/.env.sample` → `apps/site/.env.local` |
| Dashboard/CMS | PostgreSQL for Payload; MySQL/Redis for API key management | `apps/dash/.env.example` → `apps/dash/.env` |
| Docs | Retype CLI | None for editing Markdown |
| Laravel package | PHP and Composer compatible with `packages/laravel/composer.json` | See package README |

Copy only the examples you need, without overwriting existing local configuration:

```sh
cp apps/api/.env.sample apps/api/.env.local
cp apps/crons/.env.sample apps/crons/.env.local
cp apps/site/.env.sample apps/site/.env.local
cp apps/dash/.env.example apps/dash/.env
```

Replace placeholders with your own local configuration. There is no shared root runtime environment file. API/cron entrypoints load environment files from their workspace directory; exported shell variables take precedence. Next.js loads the site's environment files, while Payload uses the dashboard's `.env`. Do not use production credentials or copy production data into a contributor setup.

## Run the API

### 1. Prepare MySQL and Redis

Create a local MySQL database and dedicated account using [MySQL setup](MySQL.md). Use a Redis server that supports `JSON.GET` and `JSON.SET`, as described in [Redis setup](Redis.md). Set `REDIS_URL` if Redis is not at the default local address.

Fill in `apps/api/.env.local`. Export the same MySQL settings in the shell used to run migrations; the database workspace does not load the API workspace's environment file:

```sh
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_DB=gatekeepr
export MYSQL_USER=gatekeepr
export MYSQL_PASS='your-local-database-password'
yarn workspace @repo/db migrate:latest
yarn workspace @repo/db migrate:status
```

Migrations create the API/auth tables and disposable-domain profile storage. They do not create API users or populate external intelligence.

### 2. Create a development API key

For a local API-only setup, create a synthetic user directly instead of configuring email sign-in. In the same shell with the MySQL variables exported:

```sh
export GATEKEEPR_API_KEY="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
yarn workspace @repo/db node --input-type=module <<'JS'
import { randomUUID } from "node:crypto"
import knex from "./src/knex.js"

try {
	await knex("user").insert({
		id: randomUUID(),
		name: "Local developer",
		email: "developer@example.com",
		emailVerified: true,
		apiKey: process.env.GATEKEEPR_API_KEY,
		rpm: 0,
		disabled: false
	})
	console.log("Created local development API user")
} finally {
	await knex.destroy()
}
JS
```

Run this once per fresh database. The email column is unique, so another insert for the same developer fails; manage or update the existing local record if you need to rotate its key. Keep the generated key in this shell for requests and store it only in an ignored local environment file if needed later.

Usage counters live in Redis. The first check for a new key initializes the configured free allowance; the MySQL `rpm` field does not disable usage accounting.

### 3. Start and check authentication

In another shell, run:

```sh
yarn workspace api dev
```

The default API port is `3000`; override `PORT` in the API environment if needed. In the shell holding `GATEKEEPR_API_KEY`:

```sh
curl -X POST http://localhost:3000/ping \
  -H "Authorization: $GATEKEEPR_API_KEY"
```

A valid key returns `{"pong":true}`. The API accepts the raw key, without a `Bearer` prefix. This endpoint tests database-backed authentication, but does not exercise Redis, intelligence feeds, or the detection pipeline.

To exercise the pipeline with synthetic input:

```sh
curl http://localhost:3000/ \
  -H "Authorization: $GATEKEEPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"developer@example.com"}'
```

Reserved example domains may trigger domain threats. Use the unit fixtures for deterministic expected decisions. Live checks may perform DNS/RDAP/WHOIS/HTTPS requests and are slower on a cold cache.

## Populate intelligence deliberately

An empty Redis database is not a complete detection dataset. Configure the cron workspace against the same MySQL and Redis, then choose the relevant refresh jobs. Start with the source and job descriptions in [DataSources.md](DataSources.md) and [Crons.md](Crons.md).

Examples of available commands:

```sh
yarn workspace crons refresh:browser-versions
yarn workspace crons refresh:disposable
yarn workspace crons refresh:disposable:mx
```

These write to local databases and contact external sources. Disposable-domain enrichment can involve many network requests; review concurrency, batch-size, and timeout settings before a full run. IP feeds have separate `refresh-*.js` entrypoints listed in the cron documentation. A custom DNS resolver is optional; if you configure `127.0.0.1:5353`, start the resolver described in [RecursiveResolver.md](RecursiveResolver.md) first.

After losing a disposable-domain Redis cache, rebuild it from populated MySQL profiles with `yarn workspace crons rebuild:disposable-cache`. This does not restore every other feed or usage counter.

Keep dataset publishing disabled and leave publishing tokens empty while developing. A publisher's dry run avoids remote publication, but may still fetch data and write local output/cache entries. Source terms must be reviewed separately before redistributing generated data.

## Dashboard and public site

Follow the [dashboard guide](../apps/dash/README.md) for PostgreSQL setup, development schema creation, administrator access, and checks. MySQL auth/API-key tables and Payload's PostgreSQL CMS tables are separate stores.

For the site, populate `apps/site/.env.local` and run:

```sh
yarn workspace site dev
```

Open `http://localhost:9999`. Set `PAYLOAD_CMS_URL` and `NEXT_PUBLIC_PAYLOAD_CMS_URL` to your local dashboard origin (`http://localhost:4000`). The site's demo request uses `GATEKEEPR_API_URL`; point it at `http://localhost:3000` and use your local key in `API_KEY` when exercising that feature.

The source retains the original service's branding, URLs, pricing, email templates, and onboarding. Email OTP sign-in needs a configured SES sender/credentials; Turnstile-protected forms need their own keys. AI writer, translation, and remote-fetch services are optional dashboard integrations and use separate credentials. A static page preview does not verify all of those features.

## Docs and debugger

Product/API docs are Markdown under `apps/docs`. Run `yarn workspace docs dev` to preview or `yarn workspace docs build` to generate the site when the Retype CLI is available. Do not commit its generated `.retype` directory.

`apps/debugger` contains ad hoc inspection scripts. Read the selected script before executing it: some utilities query local data stores or perform external lookups. These are not part of the default development server.

## Deployment limits

This is a contributor setup guide. There is no supported production Docker image for the complete service. The repository includes historical infrastructure notes, but deploying a service requires your own domains, service accounts, persistent data, refresh schedule, backups, access controls, and validation. In particular, the dashboard's existing SQL migrations assume an earlier schema; they are not a complete production bootstrap for an empty database. The development schema-push option is intended for disposable databases only.
