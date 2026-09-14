# Open-Source Release Tasks

Goal: publish Gatekeepr as a reviewed open-source reference implementation without exposing private history, mislicensing third-party data, or shipping a repository that cannot be built from a clean clone.

Release gate: **do not change the visibility of `gtkppr/monorepo` or announce the project until every P0 task is complete.** The recommended release target is a fresh `gtkppr/gatekeepr` repository created from one sanitized snapshot.

## P0 — Publication Blockers

### 1. Decide the public product boundary

- [ ] Confirm that the public project is a reference implementation rather than the exact production deployment.
- [ ] Decide whether exact detection rules, blocking thresholds, live intelligence, cron publishers, and operational code should be public.
- [ ] Define the public scope for:
  - API and shared detection code.
  - Integration packages.
  - Cron/source adapters.
  - Dashboard and marketing site.
  - Documentation and internal plans.
  - Generated datasets and production intelligence.
- [ ] Document what remains private and why.

Done when:

- [ ] The README clearly distinguishes the hosted product, reference implementation, and supported self-hosting scope.
- [ ] No production-only material is included accidentally.

### 2. Create a clean public repository

- [ ] Create `gtkppr/gatekeepr` as a new repository instead of changing `gtkppr/monorepo` visibility.
- [ ] Build the initial commit from a reviewed, sanitized snapshot.
- [ ] Transfer only the intended default branch; do not copy the existing `api`, `crons`, `dash`, `docs`, `fix-agecheck`, or `site` branches automatically.
- [ ] Decide whether any tags or historical releases are safe and useful to transfer.
- [ ] Verify that package manifests, Composer metadata, documentation, and website links point to the final repository URL.
- [ ] Preserve the private monorepo as the historical source of truth if needed.

Done when:

- [ ] A public clone cannot access old monorepo commits, branches, tags, deleted blobs, or author metadata.
- [ ] The initial public commit contains only reviewed files.

### 3. Resolve code, content, data, and trademark rights

- [ ] Confirm whether Dan Suciu or SLAVA UA SRL owns the code and has authority to license it.
- [ ] Confirm that contractor, employer, copied, generated, and third-party contributions have compatible rights.
- [ ] Decide whether MIT covers only software or also documentation, website copy, research, and other content.
- [ ] Decide how logos, the Gatekeepr name, screenshots, article images, and other brand assets are licensed.
- [ ] Reconcile the root MIT license with the site/docs “All rights reserved” notices.
- [ ] Add `NOTICE`, `TRADEMARKS.md`, or separate content/data license files where appropriate.
- [ ] Replace the generic copyright holder in `LICENSE` with the verified rights holder if necessary.
- [ ] Have counsel review the final licensing structure and third-party rights decisions.

Done when:

- [ ] Every major artifact class has an explicit, non-conflicting license or reservation of rights.
- [ ] The named copyright holder can document ownership.

### 4. Stop unsafe dataset publication

- [ ] Change disposable-domain publishing from default-on to explicit opt-in (`DISPOSABLE_PUBLISH_ENABLED === "true"`).
- [ ] Change browser-version publishing from default-on to explicit opt-in (`BROWSER_VERSIONS_PUBLISH_ENABLED === "true"`).
- [ ] Add both flags to `apps/crons/.env.sample` with safe `false` defaults.
- [ ] Ensure refresh jobs do not push Git commits, tags, packages, or datasets unless publishing was explicitly enabled.
- [ ] Pause or review the related `email-disposable` and `disposable-email-infrastructure` outputs while rights are unresolved.
- [ ] Do not label merged third-party datasets as Gatekeepr-only MIT.

Done when:

- [ ] A default local or CI cron run cannot publish anything externally.
- [ ] Publication requires an explicit flag and the necessary credentials.

### 5. Complete the data-source rights ledger

- [ ] Extend `docs/DataSources.md` into a source-by-source rights ledger containing:
  - Canonical source URL.
  - License or governing terms URL.
  - License identifier where available.
  - Required copyright, attribution, and disclaimer text.
  - Allowed internal use.
  - Allowed redistribution and commercial use.
  - Source version/date and refresh cadence.
  - Approved, excluded, or permission-pending decision.
- [ ] Obtain permission for or remove sources without clear redistribution rights, including TempMailDetector.
- [ ] Resolve DISIFY’s restriction against presenting its blacklist as another product.
- [ ] Preserve the required notices for MIT and BSD-licensed inputs.
- [ ] Preserve per-source provenance through merging and generated artifacts.
- [ ] Generate an attribution/NOTICE file with each published dataset.
- [ ] Review all network, browser-version, ASN/provider, and disposable-domain sources—not only the currently identified examples.

Done when:

- [ ] Every included source has a documented, reviewed redistribution decision.
- [ ] Generated outputs retain all required notices and provenance.

### 6. Correct Spamhaus usage

- [ ] Reduce DROP downloads to no more than once daily unless different permission is obtained.
- [ ] Preserve the feed date, copyright text, and required product credit.
- [ ] Stop discarding required feed metadata during parsing.
- [ ] Review commercial and promotional references to Spamhaus in the README, website, docs, and `llms.txt`.
- [ ] Confirm that Gatekeepr’s use and redistribution comply with the current DROP policy and FAQ.

Done when:

- [ ] Refresh cadence, attribution, storage, product use, and public wording comply with documented terms or written permission.

### 7. Remove privacy and operational artifacts

- [ ] Remove all tracked `.playwright-mcp/` logs and page snapshots.
- [ ] Remove legacy dashboard media, named headshots, generated Retype output, and `.yarn/install-state.gz` from the public snapshot.
- [ ] Remove old production deployment workflows.
- [ ] Remove or replace personal admin email addresses.
- [ ] Replace real infrastructure IPs with RFC example addresses.
- [ ] Generalize developer-machine absolute paths and legacy WSA names/configuration.
- [ ] Remove or rewrite internal plans, stale checklists, and private Plane workflow instructions before publication.
- [ ] Review all public documentation for customer, employee, infrastructure, and internal roadmap details.
- [ ] Keep local database files and dumps outside the repository directory, even when ignored.

Done when:

- [ ] The public snapshot contains no browser captures, personal identifiers, private infrastructure, production deployment material, or unrelated legacy assets.

### 8. Harden secret handling and scan the final snapshot

- [ ] Add `.playwright-mcp/` to `.gitignore`.
- [ ] Replace narrow environment rules with `.env*` plus explicit exceptions for approved `.env.example` and `.env.sample` files.
- [ ] Add ignore rules for `.envrc`, backup env files, common private-key formats, `*.pfx`, `*.jks`, `*.sqlite3`, logs, dumps, and credential JSON files as appropriate.
- [ ] Stop interpolating GitHub tokens into clone URLs; use an askpass helper or authenticated header with explicit redaction.
- [ ] Run Gitleaks against the final public snapshot and any history that will be published.
- [ ] Review every finding manually and keep allow-list entries narrowly scoped.
- [ ] Rotate any credential that is found, even if history is rewritten.
- [ ] Add Gitleaks to CI.

Done when:

- [ ] A full secret scan passes with reviewed exceptions.
- [ ] No credential can appear in process arguments, logged URLs, error output, or committed configuration.

### 9. Assemble the release commit intentionally

- [ ] Review all staged, unstaged, and untracked changes together.
- [ ] Ensure `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `.gitleaks.toml`, the replacement CI workflow, API environment sample, data-source ledger, and new packages are included.
- [ ] Ensure removal of the five old deployment workflows is included.
- [ ] Do not commit only the currently staged deletions.
- [ ] Exclude local build output and audit artifacts.
- [ ] Review the complete public diff before creating the snapshot.

Done when:

- [ ] The source working tree used for export is clean and matches the reviewed public file list.

## P1 — Build and Release Readiness

### 10. Standardize the runtime and toolchain

- [ ] Choose one supported Node.js LTS for full-workspace development and CI; Node 24 is the current recommended target.
- [ ] Add `.node-version` and/or `.nvmrc`.
- [ ] Align root/package `engines`, README, `docs/Node.md`, CI, Dockerfile, and Compose configuration.
- [ ] Test public libraries against every Node version they claim to support, such as Node 22 and 24.
- [ ] Declare Retype, nodemon, and `ncu` instead of relying on global installations.
- [ ] Invoke the locked Mocha binary directly instead of relying on `npx` resolution.
- [ ] Add `"type": "module"` where required, including the database package if appropriate.

Done when:

- [ ] A contributor can use the documented runtime without global package installations.
- [ ] Runtime requirements are consistent across all files.

### 11. Fix clean-clone builds

- [ ] Replace, update, or correctly license and pin the expired Retype toolchain.
- [ ] Make `yarn build` pass without globally installed commands.
- [ ] Verify that docs, site, and dashboard builds work without production credentials.
- [ ] Fix or remove stale dashboard Docker and Compose artifacts.
- [ ] Fix dashboard documentation references to `apps/cms`, workspace `cms`, port `3002`, and other obsolete setup details.
- [ ] Replace the old API README source-idea list with useful setup and architecture documentation.
- [ ] Replace the site README’s migration-only content with contributor setup instructions.
- [ ] Add the API environment sample to the root `.env.example` instructions.
- [ ] Document Redis/MySQL bootstrap, migrations, and how to create a local API key.

Done when:

- [ ] A clean Linux clone can install, test, and build using only documented prerequisites.

### 12. Expand continuous integration

- [ ] Keep immutable Yarn installation and least-privilege GitHub permissions.
- [ ] Run API and all JavaScript package tests.
- [ ] Run site, dashboard, and docs production builds.
- [ ] Run linting, type checks, and API coverage thresholds.
- [ ] Add Composer installation and Laravel PHPUnit tests.
- [ ] Pack each publishable JavaScript package and smoke-test installation, ESM import, exports, and TypeScript declarations from its tarball.
- [ ] Add Gitleaks, dependency review, Dependabot, and CodeQL where useful.
- [ ] Add a transitive license audit and SBOM generation.
- [ ] Add timeouts and concurrency cancellation to CI jobs.

Done when:

- [ ] Required checks cover every supported language, build target, and publishable artifact.
- [ ] The same commands pass locally and in a clean CI checkout.

### 13. Prepare publishable packages

- [ ] Add a package-local `LICENSE` to every npm and Composer package.
- [ ] Add `publishConfig.access: "public"` to public scoped npm packages.
- [ ] Add `repository.directory` metadata for each workspace package.
- [ ] Document ESM, Node, `fetch`, and `AbortController` runtime requirements.
- [ ] Verify `exports`, declaration files, peer dependencies, and supported framework versions.
- [ ] Update integration READMEs with API docs, API-key signup, hosted default endpoint, source, support, and license links.
- [ ] Review package tarball contents before each release.
- [ ] Add a versioning and changelog strategy, such as Changesets or release-please.
- [ ] Use trusted publishing/provenance for npm releases where possible.

Done when:

- [ ] Every published archive is independently understandable, licensed, installable, and reproducible.

### 14. Finish security disclosure readiness

- [ ] Confirm that the security reporting address is monitored.
- [ ] Add acknowledgment and expected response-time targets to `SECURITY.md`.
- [ ] Document coordinated-disclosure expectations.
- [ ] Enable GitHub private vulnerability reporting.
- [ ] Define the supported branch/version policy.
- [ ] Add a security-report redirect to public issue templates.

Done when:

- [ ] Reporters have a private, documented path and know what response to expect.

## P2 — Community and Launch Polish

### 15. Add community-health files

- [ ] Add `CODE_OF_CONDUCT.md`.
- [ ] Add issue forms for bugs, features, documentation, and data-source corrections.
- [ ] Add a pull-request template.
- [ ] Add `CODEOWNERS` if ownership routing is desired.
- [ ] Add maintainer and support expectations.
- [ ] Add an explicit inbound-contribution licensing clause or DCO policy to `CONTRIBUTING.md`.
- [ ] Add a changelog and release/version support policy.

### 16. Finish repository discoverability

- [ ] Add the hosted site and docs links to the root README.
- [ ] Add source/GitHub links to the site footer, docs, and `llms.txt`.
- [ ] Configure the repository description, topics, social preview, and homepage.
- [ ] Add useful status badges after CI is stable.
- [ ] Configure branch protection and required checks.
- [ ] Create the first signed release and release notes.

## Final Verification

Current audit baseline:

- API tests: 186 passing, 2 pending.
- JavaScript integration/data package tests: 68 passing.
- Total: 254 passing, 2 pending.
- Site production build: passing.
- Dashboard production build: passing with warnings.
- Full workspace build: failing at the expired/undeclared Retype documentation tool.
- Laravel tests: not run because Composer was unavailable in the audit environment.
- Heuristic current/history secret scan: no recognizable live credentials found; a real Gitleaks scan is still required.

Before publication:

- [ ] Run an immutable install in a clean clone.
- [ ] Run the full JavaScript test suite.
- [ ] Run Laravel tests.
- [ ] Run linting, type checks, and coverage checks.
- [ ] Run the full workspace build successfully.
- [ ] Run package tarball smoke tests.
- [ ] Run the transitive license/SBOM audit.
- [ ] Run Gitleaks against everything that will be public.
- [ ] Review the public file list, package contents, branches, tags, and repository settings.
- [ ] Obtain final rights-holder and dataset-licensing approval.
- [ ] Confirm the source tree is clean and matches the reviewed release snapshot.
- [ ] Only then make the new repository public and announce it.

## Tracking Note

The repository’s internal instructions require Plane task tracking, but the Plane connection was unavailable when this checklist was created. Create or update the corresponding Gatekeepr Plane work item when that connection is restored, link this file, and mark it Done only after the public release gates above are satisfied.
