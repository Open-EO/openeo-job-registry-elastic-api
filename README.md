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

The images share the same API runtime and support both backends; `JOB_STORE_TYPE`
selects the backend. The DocumentDB image additionally contains its migration
files. Build the appropriate image locally:

```bash
docker build --target elasticsearch -t job-registry:elasticsearch .
docker build --target documentdb -t job-registry:documentdb .
```

An unqualified `docker build` produces the Elasticsearch image. The unqualified
release and `latest` tags also refer to the Elasticsearch image.

Each `JobStore` implements its own health probe; the health endpoint reports the
selected backend and authentication status. Elasticsearch checks every
configured node and reports partial failures as warnings.

### Azure DocumentDB storage for v2

The v2 registry can also use Azure DocumentDB (the MongoDB-compatible vCore
service), independently of any collections used for logs or vectors. This is
not the Cosmos DB for NoSQL API or the RU-based Cosmos DB for MongoDB API.
Choose `JOB_STORE_TYPE=documentdb` and configure:

- `DOCUMENTDB_URL`: MongoDB connection string, kept in a secret. The driver
  uses TLS with certificate verification, primary reads and acknowledged writes;
  retryable writes are disabled for Azure DocumentDB.
- `DOCUMENTDB_DATABASE`: an existing database name.
- `DOCUMENTDB_COLLECTION`: the job collection (default `job_registry`).
  Existing deployments using the former default must set this explicitly to
  `job_registry_v2` to continue using that collection and its migration history.
- `DOCUMENTDB_TLS`: defaults to `true`; set to `false` only for local testing.
  Certificate-verification bypass options in the URL are rejected.

Use a dedicated **unsharded collection with simple binary collation** and
restrict writes to the registry. This preserves globally unique job IDs and
deterministic ordering. Grant the runtime account
permission to read, insert, and replace documents in the job collection. The
readiness check performs a collection-scoped read and reports down on read
errors. MongoDB treats a missing collection like an empty one for reads, so
readiness cannot verify that the collection exists. The application does not
create it or manage indexes. Before
running index migrations, provision a separate, unsharded migration metadata
collection with simple binary collation. For example, after selecting the
database in `mongosh`:

```javascript
db.createCollection("job_registry__index_migrations")
```

For a custom `DOCUMENTDB_COLLECTION`, name the metadata collection by appending
`__index_migrations`. Do not share either collection with other applications or
shard them. The initial migration creates the job collection if it does not
exist, without modifying an existing collection. Verify collation and sharding
before starting the API; the migration command does not check these.

Run `npm run documentdb:migrate` from the DocumentDB image, before rolling out
the API. Supply `DOCUMENTDB_MIGRATION_URL` as a secret for a dedicated
migration identity, together with the same `DOCUMENTDB_DATABASE`,
`DOCUMENTDB_COLLECTION`, and `DOCUMENTDB_TLS` as the API. The migration URL
uses the same TLS verification rules as the runtime connection; do not pass
credentials in command-line arguments. The command does not use
`DOCUMENTDB_URL` and does not start the API. Grant the migration identity
`listCollections`, `createCollection`, and `createIndex` for the job collection,
and `find` and `insert` on the metadata collection; later migrations may need
additional privileges. Pre-provision the metadata collection to ensure its
configuration is correct. The runtime identity does not need migration
privileges.

The [versioned migration files](migrations/documentdb/) run through
`migrate-mongo`. The initial migration creates the job collection if needed and
single-field indexes on
`user_id`, `backend_id`, `status`, `infra_id`, `application_id`, `created`,
and `updated`. Matching pre-existing indexes are reused; conflicting
definitions cause an error. Never edit an applied migration: `migrate-mongo`
tracks filenames, not file contents, and does not detect edits or index drift.
If the initial migration was applied before collection creation was added, it
will not run again; verify that the collection and indexes exist.
Add a new timestamp-prefixed `.js` migration with an idempotent `up(db, client)`
function instead (generate a template with
`npx migrate-mongo create add-index -f migrations/documentdb/migrate-mongo-config.cjs`).
To replace an index, add and verify the new one first; remove
the old one in a later version after old API instances are retired.

The deployment process must run **only one migration job at a time** and wait
for it to complete before rolling out the API. The library's TTL-based locking
is disabled because it may expire during a long-running index build and does
not atomically prevent concurrent jobs. If a migration fails or a runner stops,
first confirm that no runner or server-side index build is still active before
retrying. Migrations must be safe to rerun after partial execution; do not delete
changelog records as a recovery shortcut. If the previous custom runner's
`version:*` records exist, stop and independently assess the index definitions
and history before adopting this command: migrate-mongo does not recognize
those records.

These indexes are starting points for filtering, not a guarantee of query performance.
DocumentDB may sort in memory; benchmark representative listings and size the
service for both jobs and logs. Job fields are stored as individually
JSON-encoded values to preserve arbitrary nested keys, with separate indexed
filter and pagination metadata. DocumentDB's 16 MB BSON document limit applies
to the entire stored job, including this metadata. Legacy `/jobs` routes are
disabled, existing jobs are not migrated automatically, and continuation
positions should not be reused across a backend switch.
The removed PostgreSQL backend is no longer supported: migrate and verify any
existing PostgreSQL jobs before upgrading, and configure a supported backend.

To run the integration tests, set `TEST_DOCUMENTDB_URL` to a server on which
the test user may create and drop a **dedicated test database**, optionally set
`TEST_DOCUMENTDB_TLS=true`, then run
`npm test -- --runInBand documentdb-job-store.integration.spec.ts`. The tests
create and drop a randomly named database. They are skipped without the URL.
The same settings also enable `documentdb-migrations.integration.spec.ts`;
test only with a dedicated database server where the test user may create and
drop databases.

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
