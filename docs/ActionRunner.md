# GitHub Actions

The public repository uses [GitHub-hosted runners](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners) for contributor CI. The workflow is in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml); its jobs and commands define the checks currently enforced.

No organization runner, production host access, SSH key, or deployment credentials are needed to submit a pull request. Repository CI is for validation and does not deploy the original Gatekeepr service or publish datasets/packages.

Keep pull-request workflows isolated from production services and secrets. Use read-only repository permissions for validation, pin reviewed action versions, and use synthetic fixtures or disposable services when adding checks. Do not run untrusted pull-request code on a persistent self-hosted production runner.

Deployment automation belongs to the operator's own environment and requires separate configuration and review. Do not restore the old service-specific deployment workflows as part of a normal contribution.
