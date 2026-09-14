# Security policy

Gatekeepr processes email addresses, IP addresses, and user agents. Authentication, API keys, quotas, logging, and dataset updates are security-sensitive parts of this repository.

## Report a vulnerability

Please report suspected vulnerabilities privately to `hello@gatekeepr.io`. If GitHub's private vulnerability reporting is enabled, you may also use **Security → Report a vulnerability** on [suciudan/gatekeepr](https://github.com/suciudan/gatekeepr/security).

Include the affected commit, app/package, reproduction steps, expected impact, and whether credentials or personal data are involved. Use synthetic data and redact credentials. Do not access other people's accounts or data to demonstrate impact.

Do not open public issues for exposed secrets, personal data, authentication bypasses, quota bypasses, or exploitable infrastructure details. Ordinary non-sensitive bugs can use GitHub issues.

## Scope and response expectations

Reports should identify behavior on the current default branch. There is no guaranteed response time, long-term support window, or security maintenance commitment for old versions or downstream deployments. Repository publication does not establish authorization to test the original hosted service or third-party infrastructure.

A report may cover any app, package, integration, or repository workflow. A report about a detection bypass should distinguish a missed risk signal from a vulnerability in authentication, isolation, or data handling.

See [DependencyAudit.md](docs/DependencyAudit.md) for the initial release's dependency audit, remaining advisory, and compatibility override. Run the audit again when preparing a new release; advisory data changes over time.

## Exposed credentials

If a credential is exposed, revoke or rotate it immediately, remove it from the working tree, and inspect repository history and other published artifacts. Removing a file or rewriting history does not make an exposed credential safe to reuse. Avoid pasting the credential into an issue, pull request, log, or report.
