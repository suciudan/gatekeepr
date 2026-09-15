# Dependency audit

The dependency review on 2026-09-15 used Yarn 4.9.2 and Node.js 24.21.0:

```bash
yarn install --immutable
yarn audit
node --test scripts/test-esbuild-loader.mjs scripts/test-mail.mjs
```

The full JavaScript dependency audit reports **no advisories**. CI runs the full audit without severity exclusions or advisory suppressions. Registry results can change after this review.

## esbuild configuration-loader override

The original audit found [GHSA-67mh-4wv8-2f99: development server cross-origin information exposure](https://github.com/advisories/GHSA-67mh-4wv8-2f99) in `esbuild@0.18.20`, pulled in through Payload's Drizzle configuration loader:

`apps/dash` → `@payloadcms/db-postgres` / `@payloadcms/db-sqlite@3.89.0` → `drizzle-kit@0.31.7` → `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → `esbuild`.

Payload's current release still pins this Drizzle version, and the latest Drizzle Kit release also retains the legacy loader. The root `resolutions` entry therefore targets only `@esbuild-kit/core-utils/esbuild`, replacing the vulnerable version with patched `0.25.12`. Other esbuild consumers retain their own supported dependency ranges.

This override crosses the loader's declared esbuild range. CI tests the actual resolved dependency chain, synchronous CommonJS and asynchronous ESM TypeScript transforms, and loading a TypeScript configuration with a relative import through the legacy ESM loader. Dashboard integration tests and the production build also validate Payload/Drizzle behavior with the override.

Remove the resolution and its loader-specific regression tests when Payload/Drizzle drops the legacy loader or natively resolves patched esbuild. Repeat the full audit, dashboard type check, integration tests, and build when changing it.

## Test toolchain and mail compatibility

The dashboard uses Vite 8.3, Vitest 5, and `@vitejs/plugin-react` 6.1.1 together. The React plugin requires Vite 8; upgrading it alone on Vite 7 prevents the test configuration from loading. Dependabot groups these tools and Testing Library for future updates.

Nodemailer 10 supports the repository's Node.js 24 baseline. A regression test compiles the real OTP template through its SES transport with the AWS SDK send method stubbed, without sending email or using credentials. This does not validate delivery through a live SES account.

## Next.js compatibility

Both Next.js applications use `next@16.3.5` with the matching ESLint configuration. The site uses Next.js 16's native flat ESLint configuration. The obsolete Next.js 15 PostCSS override is no longer needed.

## PHP integration

The Laravel package is a library and resolves Composer dependencies against the contributor's PHP version. During preparation, `composer validate --strict`, dependency installation, and `composer audit` passed with PHP 8.1.34 and Illuminate 10.49.0. CI additionally tests PHP 8.2 and 8.4. Run `composer audit` after installing dependencies when contributing to the Laravel package.
