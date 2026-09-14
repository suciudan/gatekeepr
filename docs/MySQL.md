# MySQL

The API, public-site authentication, API-key management, and disposable-domain profiles use MySQL through Knex/mysql2. Payload CMS content uses a separate PostgreSQL database; see the [dashboard guide](../apps/dash/README.md).

Install MySQL using the instructions for your operating system. For local Linux development, the distribution's MySQL server package is sufficient when compatible with the repository migrations. The following SQL is intended for a new local development database, run from an administrative MySQL session.

Create a dedicated database and user, replacing the example password:

```sql
CREATE DATABASE gatekeepr CHARACTER SET utf8mb4;
CREATE USER 'gatekeepr'@'localhost' IDENTIFIED BY 'replace-with-a-local-password';
GRANT ALL PRIVILEGES ON gatekeepr.* TO 'gatekeepr'@'localhost';
```

The account needs schema privileges to run migrations. Do not change the root account's authentication method or use root as the application's database user. For an application running in another container/host, create an account restricted to the actual client origin instead of copying the local host example unchanged.

Verify the application's TCP connection using a password prompt:

```sh
mysql --host=127.0.0.1 --port=3306 --user=gatekeepr --password gatekeepr
```

Set these variables in the relevant app environment files:

```dotenv
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DB=gatekeepr
MYSQL_USER=gatekeepr
MYSQL_PASS=replace-with-a-local-password
```

Run migrations from the repository root with the same `MYSQL_*` values exported in the shell:

```sh
yarn workspace @repo/db migrate:latest
yarn workspace @repo/db migrate:status
```

The Knex CLI runs in `packages/db` and does not automatically read `apps/api/.env.local`. See [Development.md](Development.md) for an export example and a development API-user bootstrap.

Use a disposable database for migration and persistence tests. For an existing deployment, back up data and test migrations against a restored copy before applying them. Database installation, upgrades, backup retention, and production account privileges are the operator's responsibility.
