# Dependency audit

The public-source preparation audit on 2026-09-14 used Yarn 4.9.2 and Node.js 24.21.0:

```bash
yarn install --immutable
yarn audit
yarn npm audit --all --recursive --no-deprecations --severity high
```

The final JavaScript dependency tree reports **no high or critical advisories**. The full audit still reports the moderate advisory below and exits with status 1. CI rejects high and critical advisories; the full audit remains available without suppressions. Registry results can change after this review.

## Remaining moderate advisory

- Package: `esbuild@0.18.20`.
- Advisory: [GHSA-67mh-4wv8-2f99: development server cross-origin information exposure](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
- Dependency path: `apps/dash` → `@payloadcms/db-postgres` / `@payloadcms/db-sqlite@3.89.0` → `drizzle-kit@0.31.7` → `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → `esbuild@0.18.20`.
- The advisory concerns esbuild's development HTTP server. Inspection of the installed configuration loader found transform calls, with no call to esbuild's `serve` or `context` APIs. The repository does not start this esbuild development server. This limits the observed exposure; it is not a claim that every possible use of these dependencies is safe.
- Do not expose an esbuild development server using this version. Remove this advisory by updating Payload/Drizzle to a dependency tree that uses a supported loader and patched esbuild. Re-run the full audit, dashboard type check, integration tests, and build after that change. Avoid forcing an incompatible esbuild version into the deprecated loader without testing its configuration-loading behavior.

## Compatibility override

The root `resolutions` entry updates the `postcss` dependency pinned by `next@15.5.25` to `8.5.28`, within PostCSS major version 8. The override addresses advisory reports in the older pinned dependency. Keep it until the supported Next.js 15 dependency tree includes an appropriate patched version, and verify site lint/build before removing it.

## PHP integration

The Laravel package is a library and resolves Composer dependencies against the contributor's PHP version. During preparation, `composer validate --strict`, dependency installation, and `composer audit` passed with PHP 8.1.34 and Illuminate 10.49.0. CI additionally tests PHP 8.2 and 8.4. Run `composer audit` after installing dependencies when contributing to the Laravel package.
