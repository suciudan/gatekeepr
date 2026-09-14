# Repository Guidelines

## Product Context
Gatekeepr is an abuse-prevention product for signup, login, and free-trial flows. The core API receives user signals
(`email`, optional `ip`, optional `user_agent`) and returns a product decision: `allow`, `challenge`, or `block`.

Primary abuse signals:
- Disposable or temporary email domains.
- Custom domains that route mail through disposable MX infrastructure.
- Invalid, expired, unregistered, or very fresh domains.
- Tor exit nodes, Spamhaus DROP ranges, Blocklist.net.ua ranges, and hosting/cloud/provider IPs.
- Suspicious or automated user agents, including command-line clients, headless browsers, and outdated browser claims.
- Suspicious email local-part composition, separators, role accounts, tags, entropy, and repeated characters.

Gatekeepr is an open-source monorepo intended to stop fake signups and free-trial abuse before accounts, credits, or sessions are created. Read CONTRIBUTING.md for the human/AI contribution workflow and docs/Development.md for local setup. The repository does not promise operation or support of the original hosted service.

## Project Structure & Module Organization
This repo is a Yarn 4 + Turborepo monorepo.

- `apps/api`: Express 5 API for fraud checks (`src/actions`, `src/checks`, `src/middlewares`, `test`).
- `apps/site`: Public Next.js site (App Router), Better Auth onboarding, blog posts in `posts/`, research content in `content/research/`, and static files in `public/`.
- `apps/dash`: Payload 3 / Next.js admin dashboard, CMS, and AI writing tools. Payload uses PostgreSQL; API key administration uses MySQL/Redis and an email allowlist. Payload user authentication is separate from that allowlist.
- `apps/crons`: Scheduled data refresh and publishing jobs for disposable domains, disposable MX profiles, Spamhaus, TOR, ASN/provider data, AWS, Cloudflare, iCloud Relay, blocklists, and browser-version datasets.
- `apps/docs`: Retype-based product/API docs published for docs content.
- `apps/debugger`: Local debugging utilities for domain/data inspection.
- `packages/core`: shared Redis helpers, email/Ses mailer, IP/CIDR utilities, WHOIS/RDAP/DNS helpers, usage accounting, crypto, logging, disposable-domain logic, and browser-version dataset helpers.
- `packages/db`: Knex/MySQL connection, migrations, and DB configuration.
- `packages/config`: shared constants and admin email configuration through `GATEKEEPR_ADMIN_EMAILS`.
- `packages/browser-versions`: browser-version intelligence and dataset helpers.
- `packages/next`, `packages/authjs`, `packages/better-auth`, `packages/passport`, `packages/supabase`, `packages/laravel`: integrations that call Gatekeepr from auth/signup flows. Laravel is managed with Composer rather than Yarn.
- `docs/`: infrastructure setup docs (Node, Redis, MySQL, Nginx, systemd).

## Runtime Architecture & Data Flow
- Public API entrypoint: `apps/api/src/app.js`.
- Main protected endpoint: `POST /`.
- Lightweight auth test endpoint: `POST /ping`.
- Request middleware order for `POST /`: API key lookup, context creation, email validation, usage quota check/logging, then check execution.
- Request context lives in `req.ctx` with `threats`, `trust`, `blocklists`, `info`, `performance`, and `payload`.
- `apps/api/src/actions/process.js` builds a dependency graph from `apps/api/src/libs/checks.js` and runs ready checks with limited concurrency (`p-limit`, default concurrency 5).
- `apps/api/src/libs/response.js` removes internal payload/halt fields and resolves the final `status`.
- `apps/api/src/libs/status.js` returns `allow` when there are no threats, `block` when any threat is in `BLOCKING_THREATS`, and `challenge` otherwise.
- Blocking threats are configured in `apps/api/src/config/status.js`; changes there affect customer-facing decisions.
- The API is mostly I/O-bound: MySQL API-key lookups, Redis usage/blocklist/CIDR checks, DNS/MX/RDAP/WHOIS/HTTPS calls, and cached data lookups dominate latency.

## Data Stores & External Dependencies
- MySQL stores users, API keys, auth-related tables, and disposable-domain profile data. Migrations live in `packages/db/migrations`.
- Redis stores API usage counters, cached WHOIS/MX/provider lookups, CIDR/blocklist indexes, disposable-domain sets, browser-version datasets, and other fast lookup data. JSON command support is required. `REDIS_URL` can configure a dedicated local server.
- PostgreSQL stores Payload CMS data for the dashboard. Existing Payload migrations assume an earlier schema. `PAYLOAD_ENABLE_DB_PUSH=true` is only for disposable development databases, never production bootstrap.
- DNS/RDAP/WHOIS and HTTPS checks are used for domain and MX validation; cache-miss behavior is much slower than cache-hit behavior.
- Scheduled jobs in `apps/crons` populate Redis and DB data used by the API. If a check depends on refreshed intelligence, verify the matching cron job and Redis key shape before changing API behavior.
- Do not commit secrets. Local environment files such as `.env.local` and `.env.sample` exist per app; production infra expectations are documented in `docs/`.

## Public Surfaces
- Marketing/product site: `https://gatekeepr.io`.
- Documentation site: `https://docs.gatekeepr.io`.
- Public status page route: `/status`.
- LLM discovery file for the site: `apps/site/public/llms.txt`, served as `/llms.txt`.
- Main documentation topics: API authorization, sending requests, decision outcomes, and email/domain/IP/user-agent checks.
- Blog and research content are Markdown-driven; prefer updating source Markdown/content files over hardcoded page text when applicable.

## Integration Packages
- `@gatekeepr/next`: helpers for Next.js route handlers, middleware-style checks, and Server Actions.
- `@gatekeepr/authjs`: helpers for Auth.js/NextAuth sign-in callbacks.
- `@gatekeepr/better-auth`: Better Auth server plugin for email sign-up/sign-in endpoints.
- `@gatekeepr/supabase`: Supabase Auth `before-user-created` hook helpers.
- JavaScript integration tests live under each package's `test` directory and use Mocha. Laravel uses PHPUnit under `packages/laravel/tests`. Dashboard integration/e2e tests use Vitest and Playwright.
- When changing API response semantics, check whether these packages and their README examples need updates.

## Build, Test, and Development Commands
Use Node.js 24 LTS and Yarn 4.9.2 from the repository root. Install with `yarn install --immutable`. Start individual workspaces as needed; quota reset is the explicit `yarn workspace crons reset:usage:daily` task.

- `yarn dev`: runs all app `dev` tasks through Turbo.
- `yarn build`: runs workspace builds via Turbo.
- `yarn workspace api dev`: run API locally; see the workspace script for the watcher used.
- `yarn workspace api test`: run Mocha tests in `apps/api/test`.
- `yarn workspace api test:coverage`: run API tests with coverage thresholds.
- `yarn workspace site dev`: run marketing site on `http://localhost:9999`.
- `yarn workspace dash dev`: run dashboard on `http://localhost:4000`.
- `yarn workspace docs dev`: run Retype docs locally.
- `yarn workspace crons refresh:disposable`: refresh disposable email sources.
- `yarn workspace crons refresh:disposable:mx`: refresh disposable MX infrastructure snapshots.
- `yarn workspace crons rebuild:disposable-cache`: rebuild Redis disposable-domain caches.
- `yarn workspace crons refresh:browser-versions`: refresh browser-version intelligence.

## Coding Style & Naming Conventions
- Language baseline: ESM JavaScript/JSX (`"type": "module"`).
- Indentation: tabs are used in current source; preserve existing style per file.
- Strings: mostly double quotes; avoid mixing styles in touched files.
- Naming: `camelCase` for variables/functions, `PascalCase` for React components, kebab-case for many utility filenames (for example `apiKeyMiddleware.js`, `refresh-tor-exit-nodes.js`).
- Dashboard checks: `yarn workspace dash lint` and `yarn workspace dash check-types`. For site changes, run the supported workspace checks and visually inspect the result; verify script/tool availability before claiming lint or build success.

## Testing Guidelines
- Framework: Mocha (`apps/api/package.json`).
- Place tests under `apps/api/test` with `*.test.js` names.
- Prefer focused unit tests per check/middleware and assert threat/trust outputs explicitly.
- Run API tests before opening a PR: `yarn workspace api test`.
- For integration packages, run the relevant package test command such as `yarn workspace @gatekeepr/next test`.
- For static content-only changes, no runtime tests are required, but still verify paths and generated public URLs.

## High-Risk Change Areas
- Decision logic: `apps/api/src/config/status.js`, `apps/api/src/libs/status.js`, and any check that pushes blocking threats.
- Quota/accounting: `packages/core/src/usage.js` and `apps/api/src/middlewares/usageMiddleware.js`.
- API key access: `apps/api/src/middlewares/apiKeyMiddleware.js` and user table/API key fields.
- Redis key formats used by API checks and cron refresh jobs. Keep API lookup keys and cron write keys in sync.
- Disposable-domain and disposable-MX detection. Exact-domain checks, MX hostname checks, and MX IP checks have different false-positive risks.
- Auth/onboarding flows in `apps/site` and admin access in `apps/dash`.

## Commit & Pull Request Guidelines
Recent history favors short, imperative commit subjects (for example `update packages`, `upgrade turbo`, `blog post fixes`).

- Keep commit titles concise and action-oriented.
- Scope commits to one logical change.
- PRs should include: purpose, affected apps/packages, test evidence (commands run), and screenshots for `site`/`dash` UI changes.
- Link related issues/tasks and call out config or migration changes explicitly.

## Security & Configuration Tips
- Never commit secrets; use environment files locally (`.env*` is included in Turbo inputs).
- Validate infra dependencies (Redis/MySQL/Nginx/certs/systemd) against the runbooks in `docs/` before deploying.
## Contributor and Agent Boundaries
- Inspect the working tree before editing and preserve unrelated changes. Read nearby source and any more specific instructions.
- Use synthetic fixtures and disposable databases. Do not send test requests to the original hosted API or use production credentials/data.
- Keep dataset publishing disabled unless explicitly requested by a maintainer. A dry run can still fetch external data and update local caches or output.
- Do not commit environment files, generated media, database dumps, build output, credentials, or personal data. Examples contain placeholders only.
- Add dependencies to the importing workspace and maintain the Yarn lockfile. Verify migrations, environment variables, and public URLs against the actual code.
- AI-assisted changes follow the same review and testing requirements as other contributions. Report checks actually run, failures, skipped checks, and material limitations.
- GitHub Actions validation uses hosted runners. Changes to deployment, repository visibility, package publishing, or external communications require an explicit maintainer instruction.
