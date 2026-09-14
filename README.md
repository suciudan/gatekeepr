# Gatekeepr

Gatekeepr is an open-source abuse-prevention engine for signup, login, waitlist, and free-trial flows. Send an email address, with an optional IP address and user agent, and receive an `allow`, `challenge`, or `block` decision with the signals behind it.

The entire monorepo is available: the API, data refresh jobs, website, administration and content tools, documentation, and integration packages. Originally built as a commercial service, it is now shared for anyone to study, use, adapt, and improve under the [MIT license](LICENSE).

The code includes service-specific onboarding, usage quotas, content, and deployment assumptions. Running the complete service requires configuring databases, refreshed intelligence, and optional external services. See [local development](docs/Development.md) for the available setup paths and limitations. Publishing this code does not promise continued availability of the original hosted service or an ongoing support schedule.

## What it checks

- Disposable and temporary email domains, including custom domains using disposable MX infrastructure.
- Invalid, unregistered, expired, or very fresh domains.
- Tor exits, Spamhaus DROP ranges, Blocklist.net.ua ranges, and cloud/provider IP ranges.
- Suspicious user agents, including command-line clients, headless browsers, automation tools, and outdated browser claims.
- Email local-part patterns such as role accounts, tags, separators, entropy, and repeated characters.

These are risk signals. Review the decision policy for your application and test legitimate traffic before enforcing it.

## Repository layout

This is a Yarn 4 and Turborepo monorepo.

| Path | Purpose |
| --- | --- |
| [apps/api](apps/api) | Express API and detection tests. |
| [apps/crons](apps/crons) | Intelligence refresh, enrichment, and optional dataset publishing jobs. |
| [apps/site](apps/site) | Next.js public site, account onboarding, blog, and research content. |
| [apps/dash](apps/dash) | Payload/Next.js administration, CMS, and AI writing tools. Uses PostgreSQL for CMS data and MySQL for API key management. |
| [apps/docs](apps/docs) | Retype API and product documentation. |
| [apps/debugger](apps/debugger) | Local domain/data inspection utilities. |
| [packages/core](packages/core) | Redis, DNS/RDAP/WHOIS, IP/CIDR, mail, logging, and usage helpers. |
| [packages/db](packages/db) | Knex/MySQL connection and migrations. |
| [packages/config](packages/config) | Shared constants and administrator configuration. |
| [packages/browser-versions](packages/browser-versions) | Browser-version intelligence and dataset helpers. |
| [packages/next](packages/next) | Next.js integration. |
| [packages/authjs](packages/authjs) | Auth.js/NextAuth integration. |
| [packages/better-auth](packages/better-auth) | Better Auth integration. |
| [packages/passport](packages/passport) | Passport.js/Express integration. |
| [packages/supabase](packages/supabase) | Supabase Auth hook integration. |
| [packages/laravel](packages/laravel) | Laravel client and middleware, managed with Composer. |
| [docs](docs) | Development and infrastructure notes. |

## Start contributing

Use Node.js 24 LTS and the Yarn version pinned by `packageManager` (`4.9.2`). See [Node.js and Yarn setup](docs/Node.md).

```sh
git clone https://github.com/suciudan/gatekeepr.git
cd gatekeepr
corepack enable
yarn install --immutable
yarn workspace api test
```

For a contribution, clone your fork and create a branch. The focused API tests use controlled dependencies; a passing test run does not establish that a complete service deployment is configured. For runtime setup, including Redis JSON support, MySQL migrations, and a local API key, follow [docs/Development.md](docs/Development.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow, validation commands, and guidance for AI-assisted contributions. [AGENTS.md](AGENTS.md) contains repository-specific instructions for coding agents.

## API example

After creating a local key and starting the API, send its raw value in `Authorization` (without a `Bearer` prefix):

```sh
curl http://localhost:3000/ \
  -H "Authorization: $GATEKEEPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"support@example.com","ip":"203.0.113.10","user_agent":"Mozilla/5.0 ..."}'
```

Illustrative response shape; actual fields and decisions depend on the supplied signals and available intelligence:

```json
{
	"status": "challenge",
	"threats": ["email_local_generic_role"],
	"trust": ["email_passes_rfc5322"],
	"blocklists": [],
	"info": {}
}
```

The decision resolver returns `allow` with no threats, `block` when a threat belongs to the configured blocking set, and `challenge` otherwise. See the source docs for [authorization](apps/docs/api/authorization.md), [requests](apps/docs/api/send-request.md), and [decisions](apps/docs/api/decisions.md).

Integration packages can target a self-hosted API; check their individual README files for endpoint configuration and handling of challenge/block responses.

## Data and security

Runtime intelligence is populated by refresh jobs and is not bundled as a complete database. Source feeds and generated datasets have their own terms; the repository's MIT license does not replace them. See [data sources and redistribution notes](docs/DataSources.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

Keep credentials, user data, database dumps, and generated media out of contributions. Report sensitive vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Maintainers preparing a source release should follow [the release guide](docs/Releasing.md).
