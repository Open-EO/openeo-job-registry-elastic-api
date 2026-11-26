// Exits non-zero unless every migration shipped with this build has been
// applied, so an API instance never starts against an older schema.
// `migrate-mongo status` reports pending migrations but always exits 0, so
// this wraps its programmatic API. It uses the runtime DOCUMENTDB_URL and only
// reads the changelog; it never runs or records migrations.
import { config, database, status } from 'migrate-mongo';
import settings from './migrate-mongo-config.cjs';

async function main() {
  config.set({
    mongodb: settings.connection(process.env.DOCUMENTDB_URL, 'DOCUMENTDB_URL'),
    migrationsDir: settings.migrationsDir,
    changelogCollectionName: settings.changelogCollectionName,
    migrationFileExtension: settings.migrationFileExtension,
    useFileHash: settings.useFileHash,
  });
  const { db, client } = await database.connect();
  try {
    const migrations = await status(db);
    const pending = migrations
      .filter((migration) => migration.appliedAt === 'PENDING')
      .map((migration) => migration.fileName);
    if (pending.length) {
      console.error(
        `Database schema is behind this build; pending migrations: ${pending.join(
          ', ',
        )}. Run \`npm run documentdb:migrate\` before starting the API.`,
      );
      return 1;
    }
    console.log(
      `Database schema is compatible (${migrations.length} migration(s) applied).`,
    );
    return 0;
  } finally {
    await client.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`Database schema check failed: ${error.message}`);
    process.exitCode = 1;
  },
);
