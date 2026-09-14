# Preparing a public source release

The release includes every application and shared/integration package in the monorepo. Production databases, local environment files, dashboard uploads, downloaded feeds, browser captures, dependencies, and build output are excluded.

## Initial publication

Use a clean source import for the first public repository at `suciudan/gatekeepr`. The former private repository contains historical local/generated artifacts; changing its visibility or pushing its existing branches would expose those files again. Keep the private history separately. Do not use a mirror push.

After completing edits and tests, export the current working tree to a **new directory outside the repository**:

```sh
python3 scripts/export-public-source.py ../gatekeepr-public
```

The exporter copies tracked files and untracked source files that are not ignored, including uncommitted work. It respects current deletions and ignore rules, refuses symlinks and existing destinations, and never copies `.git`. Review the file list: ignored files are not the only possible source of confidential content.

Scan the exported directory using Gitleaks 8.30.1 or a newer compatible release:

```sh
gitleaks dir ../gatekeepr-public --config .gitleaks.toml --redact --max-decode-depth 2 --max-archive-depth 2
```

Use the built-in Gitleaks rules as well as the repository's narrowly scoped false-positive exceptions. If anything sensitive is found, remove it from the source, rotate exposed credentials, and create a fresh export. Keep reports containing private paths or data outside the public tree.

In the exported directory, verify dependency installation and the checks in [CONTRIBUTING.md](../CONTRIBUTING.md). Review [third-party notices](../THIRD_PARTY_NOTICES.md), retain SDK license files, and inspect all workflow triggers and permissions. Data publishers must remain disabled in example configuration.

Only when the reviewed snapshot is ready, initialize a new Git repository there with an initial commit and publish that directory to `suciudan/gatekeepr`. Confirm the destination and visibility before the first push. Do not change the original repository's remote or visibility as part of this import. Publishing the source does not deploy the apps or publish npm/Composer packages.

## GitHub settings

- Enable Issues and private vulnerability reporting, so [SECURITY.md](../SECURITY.md) has a working private reporting route.
- Enable secret scanning/push protection and Dependabot alerts where available.
- Use GitHub-hosted runners for public contributions. Do not attach production/self-hosted runners or copy production secrets into contributor workflows.
- After the initial CI run, require the applicable CI checks on pull requests and protect `main` against force pushes and deletion.
- Keep package publishing and application deployment as separate, deliberately configured workflows.

## Subsequent releases

Work from the new public repository normally. Run the relevant tests, review the dependency audit, scan changes/history, and preserve upstream notices. A clean scan is evidence of what the scanner checked, not a guarantee that all confidential material or vulnerabilities have been identified.
