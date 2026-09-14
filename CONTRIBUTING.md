# Contributing to Gatekeepr

Contributions across the entire monorepo are welcome: bug fixes, documentation, tests, integration improvements, and better abuse detection. For a substantial architectural change or new external service, open an issue first to explain the problem and proposed approach. Small, focused fixes can go directly to a pull request.

## Get started

1. Fork the repository and clone your fork.
2. Read [README.md](README.md), [AGENTS.md](AGENTS.md), and the relevant app or package documentation.
3. Use Node.js 24 LTS and Yarn 4.9.2. Run `corepack enable` and `yarn install --immutable` at the repository root.
4. Create a branch for one logical change.
5. Follow [docs/Development.md](docs/Development.md) only for the services your change requires. API and JavaScript integration unit tests are a useful starting point without a complete deployment.

Use local, disposable services and synthetic examples when reproducing issues. Do not point development jobs or tests at a production database. Report security-sensitive problems through [SECURITY.md](SECURITY.md), not public issues.

## Implementation expectations

- Keep changes scoped and preserve existing formatting. Most API/shared JavaScript uses ESM, tabs, and double quotes; the dashboard uses TypeScript and its own existing style.
- Add dependencies to the workspace that imports them. Update `yarn.lock` with Yarn when dependencies change; do not add npm or pnpm lockfiles.
- Explain behavior changes with a concrete before/after example. Update the API docs and affected integration README files when request, response, or decision behavior changes.
- Keep Redis writers and readers consistent. A changed dataset format or Redis key needs compatible cron updates and, where necessary, a rebuild or migration procedure.
- Include focused regression tests for detection rules, authentication, accounting, and persistence changes. For static content-only changes, check links and generated URLs instead of adding runtime tests.
- For new migrations, explain fresh-install and existing-data behavior. Exercise migrations on a disposable database and describe rollback limits.

## Detection changes

False positives can block real people from signing up. A detection contribution should include synthetic examples that should match, legitimate cases that must remain allowed, and a clear explanation of whether the resulting status changes. Assert the specific threat/trust output and decision where applicable.

Tests should control time, DNS, HTTP, Redis, and database responses where practical. Avoid depending on a real domain's current age, ownership, MX configuration, or an external feed's current contents. Use fake credentials and reserved example domains/IP addresses in fixtures.

Changes to `apps/api/src/config/status.js`, quota/accounting, API key access, and disposable MX/IP matching deserve particular care. Shared infrastructure may host legitimate domains; an IP match alone needs an explicit false-positive assessment.

## Validation

Run commands from the repository root unless shown otherwise. Run the API suite for runtime or shared-code changes:

```sh
yarn workspace api test
```

Run the relevant integration package suites when changing integrations or API semantics:

```sh
yarn workspace @gatekeepr/next test
yarn workspace @gatekeepr/authjs test
yarn workspace @gatekeepr/better-auth test
yarn workspace @gatekeepr/passport test
yarn workspace @gatekeepr/supabase test
yarn workspace @repo/browser-versions test
```

Additional commands depend on the affected workspace:

| Change | Validation |
| --- | --- |
| API coverage | `yarn workspace api test:coverage` |
| Dashboard | `yarn workspace dash check-types`, `yarn workspace dash lint`, relevant `test:int` / `test:e2e` suites; see [dashboard setup](apps/dash/README.md) for service and browser prerequisites. |
| Site | `yarn workspace site build` with the required local configuration; visually check changed pages. |
| API docs | Check Markdown links and `yarn workspace docs build` with Retype available. |
| Laravel integration | In `packages/laravel`, run `composer install` and `composer test` using a PHP version compatible with `composer.json`. |

`yarn test` and `yarn build` run multiple workspaces through Turbo. Some tasks need configured services, native dependencies, or browsers. Use focused commands first, and report any check you could not run with the reason. Do not claim a complete build or test pass from a subset of checks.

## AI-assisted and agent contributions

AI-assisted contributions are welcome and meet the same review standard as other changes. The contributor submitting a pull request is responsible for understanding and validating the result.

- Read `AGENTS.md` and nearby code before editing. Follow any more specific instructions within the affected directory.
- Inspect the working tree and preserve unrelated work. Do not reset files or regenerate large artifacts to hide a failure.
- Verify imported APIs, configuration names, scripts, and documentation claims against the actual repository or authoritative documentation.
- Review the final diff, remove unrelated edits, and run appropriate checks. Record commands that actually ran and distinguish failures from checks that were skipped.
- Do not include secrets, private prompts, personal data, or unlicensed copied code in generated output.
- Do not publish packages, datasets, deployments, or messages to external services as part of an ordinary code contribution. Such actions require a separate, explicit maintainer instruction.

Mention material use of AI in the pull request so reviewers know how the change was prepared. A generated explanation is not a substitute for reproduction steps or test evidence.

## Pull requests

Include the problem and resulting behavior, affected apps/packages, and validation evidence. Add screenshots for site/dashboard UI changes and identify migrations, environment variables, dependency updates, and data-source implications. Link a related issue when available.

Use a concise, action-oriented title. Be respectful and specific in review discussions. Submitting a contribution means you have the right to contribute it under the repository's [MIT license](LICENSE); retain upstream notices for any third-party code.

## Data and secrets

Never commit real environment files, credentials, API keys, webhooks, database dumps, user records, generated dashboard media, or production deployment configuration. Checked-in `.env.sample` and `.env.example` files must contain placeholders only.

For new external feeds, document the source, terms/license link, intended refresh frequency, attribution, and redistribution constraints in [docs/DataSources.md](docs/DataSources.md). Public availability alone does not grant permission to republish a dataset. Publishing must remain explicitly opt-in.
