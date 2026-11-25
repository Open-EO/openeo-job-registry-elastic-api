<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Job registry API contracts

The existing `/jobs` endpoints retain their Elasticsearch-query contract.
An additive backend-neutral API is available at
`/v2/jobs`; callers explicitly select the contract by URL.
Create bodies include `backend_id`. Other CRUD routes use globally unique job
IDs. Dedicated POST listings with JSON bodies cover user jobs (`/v2/jobs/user`), active jobs
(`/v2/jobs/active`) and cleanup candidates (`/v2/jobs/cleanup-candidates`).
Listings span backends unless `backend_id` is supplied. All listings accept optional
`max_age` and `max_updated_ago` filters. These
are day counts; their cutoffs remain fixed across pages. Responses include a
structured `next_page` continuation to resend in the next request body. There is no
public v2 generic search endpoint.
By default both use the same Elasticsearch index.
The Elasticsearch connection is configured with `DB_HOSTS` (a comma-separated
list) and `DB_JOBS_IDX` (the job index).
Shared behavior lives in `JobRegistryService`; `JobStore` adapters implement
atomic create/read/conditional replacement and typed searches.
To add a backend, define its type in `JOB_STORE_TYPES`, its configuration in
the config schema, and its adapter and optional imports, providers, and
controllers in the `JobsModule` store registrations.
V2 uses globally unique job IDs as document IDs, replayable creation and
optional ETag/If-Match support. Creating an existing job in the same backend
returns its current state without overwriting it only when the submitted body
matches the original creation input; different input returns 409. Only a creation
fingerprint is retained, not response history. `If-Match` is optional;
strict writes retain stale-ETag protection, while unconditional writes are
attempted once and return 409 on a concurrency conflict for the client to retry.
A stale PATCH whose
requested fields are already applied returns the current job without another
write; repeated DELETE of a tombstone returns 204. The registry does not enforce
status transition order, and `created` cannot be patched. Registry and store
debug logs trace operations and decisions; they do not include
request bodies, headers, ETags, or tokens. Unconditional writes also log the
route and job ID at info level.
Existing random/hashed-ID records
require explicit migration before v2 direct access; legacy routes are unchanged.

### Container images

The Elasticsearch and PostgreSQL image tags now contain the same API runtime.
The PostgreSQL API image does not include Flyway, Java, or migration files;
database migrations are run by the separate deployment job.

Existing store-specific image tags are retained for compatibility. To build
locally, use `docker build -t job-registry:api .`; either historical Docker
target (`elasticsearch` or `postgresql`) also produces this same runtime image.

### PostgreSQL storage for v2

The v2 registry can instead use PostgreSQL 13 or newer, including Azure Database for
PostgreSQL Flexible Server. When PostgreSQL is selected, the Elasticsearch-only
legacy `/jobs` API is disabled; its routes return 404. Existing Elasticsearch
records are not migrated automatically. Plan and verify a migration before
switching existing clients.
Continuation positions should not be reused across a backend switch.

1. Provision a PostgreSQL database and configure:

   - `JOB_STORE_TYPE=postgresql` (default: `elasticsearch`)
   - `POSTGRES_URL`: PostgreSQL connection URL, including database and
     credentials. Store credentials securely; do not commit them.
   - `POSTGRES_SSL=true` (default): use TLS with server certificate
     verification. For a trusted private CA, set `POSTGRES_CA_FILE` to
     the PEM bundle path. Set `POSTGRES_SSL=false` only for local testing.
     Do not put SSL parameters in the URL; these settings control TLS.

2. Run database migrations through the separate deployment job before rolling
   out the API. The application does not run or validate Flyway migrations at
   startup. Its PostgreSQL health check verifies that `job_registry_v2` is
   accessible; the API role needs SELECT, INSERT, UPDATE on that table (plus
   USAGE on the schema), but does not need migration privileges.

Migration files in [`sql/migrations/`](sql/migrations/) use Flyway's
`V<version>__<description>.sql` naming convention. Flyway records versions
and checksums in `flyway_schema_history`. `V1__initial.sql` creates the complete
initial schema. Once applied, do not modify it; add a new version instead.
Changes should be compatible with PostgreSQL
transactions; plan backward-compatible schema changes for rolling deployments
and test any long-running migrations separately.

For local development, install Flyway separately and configure its
`FLYWAY_URL` as a PostgreSQL JDBC
URL, `FLYWAY_USER`, `FLYWAY_PASSWORD`, and `FLYWAY_LOCATIONS` as
`filesystem:sql/migrations`, and `FLYWAY_GROUP=true`, then run `npm run db:migrate`. Set JDBC TLS options
as appropriate (for example `sslmode=verify-full` and, for a private CA,
`sslrootcert`). Keep credentials out of source control and command history.
Unlike application startup, the Flyway CLI does not use `POSTGRES_URL`.

Flyway refuses to migrate a non-empty schema without history. Its `baseline`
command can adopt an existing schema, but **does not verify that schema**:
back up and independently verify it against the initial migration before
baselining. Existing histories from the earlier custom runner are not adopted.

PostgreSQL settings are used and validated only when `JOB_STORE_TYPE` is
`postgresql`; the job-store Elasticsearch settings are included only when it is
`elasticsearch`. Selecting PostgreSQL also disables the legacy `/jobs` API.

The PostgreSQL schema stores each `Job` property in a typed column; structured
values such as `process`, `job_options`, `usage`, `results_metadata`, `links`,
and `assets` use JSONB. A presence column preserves the distinction between an
omitted optional field and an explicitly null value. Soft-delete and registry
concurrency metadata are stored separately from the public job fields. Tune
indexes and provision capacity based on measured workloads. Writes use atomic
version-checked updates; listing continuation uses the same creation-time/job-ID
ordering as v2 Elasticsearch. The `/health` check uses PostgreSQL instead of
Elasticsearch when PostgreSQL is selected.
Each `JobStore` implements its own health probe; the health endpoint reports the
selected backend and authentication status. Elasticsearch checks every
configured node and reports partial failures as warnings.

To run the PostgreSQL integration tests, set `TEST_POSTGRES_URL` to a
**dedicated test database** whose user can create and drop schemas, then run
`npm test -- --runInBand postgresql-job-store.integration.spec.ts`.
The tests create and remove their own schema and do not require Flyway.
Without this variable they are skipped.

### Azure DocumentDB storage for v2

The v2 registry can also use Azure DocumentDB (the MongoDB-compatible vCore
service), independently of any collections used for logs or vectors. This is
not the Cosmos DB for NoSQL API or the RU-based Cosmos DB for MongoDB API.
Choose `JOB_STORE_TYPE=documentdb` and configure:

- `DOCUMENTDB_URL`: MongoDB connection string, kept in a secret. The driver
  uses TLS with certificate verification, primary reads and acknowledged writes;
  retryable writes are disabled for Azure DocumentDB.
- `DOCUMENTDB_DATABASE`: an existing database name.
- `DOCUMENTDB_COLLECTION`: the job collection (default `job_registry_v2`).
- `DOCUMENTDB_TLS`: defaults to `true`; set to `false` only for local testing.
  Certificate-verification bypass options in the URL are rejected.

Provision a dedicated **unsharded collection with simple binary collation**
before starting the API, and restrict writes to the registry. This preserves
globally unique job IDs and deterministic ordering. Grant the runtime account
permission to list collections and read, insert, and replace documents in the
job collection. The readiness check reports down if the collection is missing
or inaccessible; the application does not create it or manage indexes.
For example, after selecting the database in `mongosh`:

```javascript
db.createCollection("job_registry_v2")
db.job_registry_v2.createIndex({ user_id: 1 })
db.job_registry_v2.createIndex({ backend_id: 1 })
db.job_registry_v2.createIndex({ status: 1 })
db.job_registry_v2.createIndex({ infra_id: 1 })
db.job_registry_v2.createIndex({ application_id: 1 })
db.job_registry_v2.createIndex({ created: 1 })
db.job_registry_v2.createIndex({ updated: 1 })
```

These are starting points for filtering, not a guarantee of query performance.
DocumentDB may sort in memory; benchmark representative listings and size the
service for both jobs and logs. Job fields are stored as individually
JSON-encoded values to preserve arbitrary nested keys, with separate indexed
filter and pagination metadata. DocumentDB's 16 MB BSON document limit applies
to the entire stored job, including this metadata. Legacy `/jobs` routes are
disabled, existing jobs are not migrated automatically, and continuation
positions should not be reused across a backend switch.

To run the integration tests, set `TEST_DOCUMENTDB_URL` to a server on which
the test user may create and drop a **dedicated test database**, optionally set
`TEST_DOCUMENTDB_TLS=true`, then run
`npm test -- --runInBand documentdb-job-store.integration.spec.ts`. The tests
create and drop a randomly named database. They are skipped without the URL.

## Installation

Node.js 26 or newer is required.

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

HTTP logs omit request headers and query strings and redact response cookies.
Bearer verification logs status only, not tokens, introspection payloads or
remote error details. Query-string tokens remain supported for compatibility,
but callers should prefer the `Authorization` header.

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
