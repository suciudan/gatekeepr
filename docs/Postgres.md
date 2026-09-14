# Postgres

To install PostgreSQL, run the following command in the command prompt:

```shell
sudo apt install postgresql
```

## Configure PostgreSQL

Run the following command at a terminal prompt to connect to the default PostgreSQL template database:

```shell
sudo -u postgres psql template1
```

You can run the following SQL command at the psql prompt to configure the password for the user postgres:

```sql
ALTER USER postgres with encrypted password 'your_password';
```

## Create the Dashboard Database

Use a dedicated role for the dashboard app. Replace the password before running this.

```shell
sudo -u postgres psql
```

```sql
CREATE ROLE gatekeepr_dash WITH LOGIN PASSWORD 'replace_with_a_long_random_password';
CREATE DATABASE gatekeepr_dash OWNER gatekeepr_dash;
\c gatekeepr_dash
GRANT CONNECT ON DATABASE gatekeepr_dash TO gatekeepr_dash;
GRANT USAGE, CREATE ON SCHEMA public TO gatekeepr_dash;
ALTER SCHEMA public OWNER TO gatekeepr_dash;
```

The production dashboard database URL should then be stored as the GitHub Actions secret `DASH_DATABASE_URL`:

```text
postgresql://gatekeepr_dash:replace_with_a_long_random_password@127.0.0.1:5432/gatekeepr_dash
```

Also set `DASH_PAYLOAD_SECRET` to a long random value. It must remain stable after launch because Payload uses it for auth/session crypto.

## Import the Dashboard Dump

Import the dump before deploying the `dash` branch for the first time. The committed Payload migrations are incremental and expect the baseline tables from this dump to exist.

From the production server, copy the dump file to the host and import it into the empty database:

```shell
gunzip -c dash-production-import-2026-05-05.sql.gz | psql "postgresql://gatekeepr_dash:replace_with_a_long_random_password@127.0.0.1:5432/gatekeepr_dash"
```

Verify the import created the baseline tables and stamped the committed migrations:

```shell
psql "postgresql://gatekeepr_dash:replace_with_a_long_random_password@127.0.0.1:5432/gatekeepr_dash" -c "select to_regclass('public.blog_posts'), count(*) from payload_migrations;"
```

After the import, deploy the `dash` branch. The GitHub workflow verifies the baseline import, runs Payload migrations, then restarts `gatekeepr-dash`.

## Restore Dashboard Media

Payload stores uploaded files on disk, not inside Postgres. Keep the dashboard media directory on the production server at:

```text
/root/monorepo/apps/dash/media
```

The production workflow sets `PAYLOAD_MEDIA_DIR` to that path and preserves the directory between deploys. If the initial dump has blog posts with legacy hero image URLs but no Payload media records, run the backfill after importing the dump:

```shell
cd /root/monorepo/apps/dash
DOTENV_CONFIG_PATH=.env.production yarn backfill:blog-hero-media
```

The deploy workflow also runs this backfill after migrations. It is idempotent: existing linked hero images are skipped, existing media rows are reused, and missing files are downloaded from the stored hero image URLs.

## Run Dashboard Maintenance Scripts

Dashboard maintenance scripts need the production environment file. When running them manually from the production server, load `.env.production` explicitly:

```shell
cd /root/monorepo/apps/dash
DOTENV_CONFIG_PATH=.env.production yarn sync:blog-categories
```

After the production script aliases are deployed, this equivalent command can be used:

```shell
cd /root/monorepo/apps/dash
yarn sync:blog-categories:production
```
