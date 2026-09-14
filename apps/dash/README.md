# Dashboard and CMS

`apps/dash` is the Payload 3 / Next.js workspace for content management, AI writing tools, and Gatekeepr API-key administration. Payload stores CMS data in PostgreSQL. API-key management uses the separate MySQL and Redis stores shared with the API.

## Local setup

From the repository root, install dependencies as described in [local development](../../docs/Development.md), then copy the example if you do not already have a local environment file:

```sh
cp apps/dash/.env.example apps/dash/.env
yarn workspace dash db:start
```

The Compose command starts a local PostgreSQL service; run the dashboard itself on the host through Yarn. Its default database matches the example `DATABASE_URL` (`gatekeepr_cms` on port `5432`). Replace `PAYLOAD_SECRET` with a generated secret, for example the output of:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

For a new, disposable development database, start Payload with schema creation enabled:

```sh
PAYLOAD_ENABLE_DB_PUSH=true yarn workspace dash dev
```

Open `http://localhost:4000/admin` and create your first local Payload user. If you need the Gatekeepr API-key administration views, add that user's email to `GATEKEEPR_ADMIN_EMAILS` in `.env`, configure MySQL/Redis, and run the API database migrations described in [local development](../../docs/Development.md). Restart after changing environment variables. The allowlist protects Gatekeepr administration features; it is separate from Payload user authentication.

PostgreSQL schema push is explicitly opt-in and disabled in production. Use it only with a disposable development database, and keep it enabled when iterating on collection schemas there. Existing SQL migrations under `src/migrations` assume an already-created schema; `yarn workspace dash migrate` is not a fresh production database bootstrap. Prepare and validate an initial migration before using this application in a new production deployment.

Local uploads go in `media/` and are ignored by Git. No production content database or uploaded media collection is included. External AI, translation, browsing, logging, and backup features need their own configuration and are not required merely to inspect the code.

## Commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `yarn workspace dash db:start` | Start the local PostgreSQL service. |
| `yarn workspace dash db:stop` | Stop PostgreSQL while retaining its volume. |
| `yarn workspace dash dev` | Start the app at `http://localhost:4000`. |
| `yarn workspace dash build` | Build the app with the required environment configured. |
| `yarn workspace dash lint` | Run ESLint. |
| `yarn workspace dash check-types` | Check TypeScript. |
| `yarn workspace dash generate:types` | Regenerate Payload types after schema changes. |
| `yarn workspace dash generate:importmap` | Regenerate the admin import map after component changes. |
| `yarn workspace dash migrate` | Apply incremental migrations to an existing schema. |

## Tests

Integration tests use Vitest. When PostgreSQL is configured and the role can create databases, setup creates temporary test databases and teardown removes them. Otherwise setup falls back to temporary SQLite files. Use a local test service and a configured `PAYLOAD_SECRET`:

```sh
PAYLOAD_ENABLE_DB_PUSH=true yarn workspace dash test:int
```

The SQLite fallback does not prove PostgreSQL-specific behavior. Exercise database changes against PostgreSQL and report which backend was used.

End-to-end tests require a configured app and the Playwright Chromium browser:

```sh
yarn workspace dash exec playwright install chromium
yarn workspace dash test:e2e tests/e2e/frontend.e2e.spec.ts
```

This frontend smoke test checks the admin authentication/first-user screen and does not create a user. Review `playwright.config.ts` for server startup and `PLAYWRIGHT_CMS_BASE_URL` overrides.

`yarn workspace dash test:e2e` also runs admin tests that create and delete the fixture user defined in `tests/helpers/seedUser.ts`. The app and test process must use the same disposable CMS database. For an existing local server, ensure its environment matches the test configuration; never run this suite against a production service. `yarn workspace dash test` runs the integration and end-to-end suites together.

The live AI writer suite is skipped by default. It contacts third-party sources and can incur provider charges. Only after configuring a dedicated test environment, appropriate provider credentials, and test user access, opt in with:

```sh
RUN_LIVE_AI_WRITER_E2E=true yarn workspace dash test:e2e tests/e2e/aiWriter.e2e.spec.ts
```

With a custom `PLAYWRIGHT_CMS_BASE_URL`, the AI writer suite expects the fixture account to exist on that test server. The suite creates content and generated artifacts; inspect the test before running it and keep all resulting data outside the source release.

## Legacy SQLite import

The repository retains one-off migration helpers. If you own a legacy SQLite content database, set `PAYLOAD_SQLITE_DATABASE_URL` to its path and `DATABASE_URL` to a prepared PostgreSQL database, then review `src/bin/migrateSqliteToPostgres.ts` before running `yarn workspace dash migrate:sqlite-to-postgres`. Back up both databases first. This is separate from the MySQL migration process and is not needed for new development setups.
