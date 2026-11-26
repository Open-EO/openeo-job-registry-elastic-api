const database = process.env.DOCUMENTDB_DATABASE;
const collection = process.env.DOCUMENTDB_COLLECTION ?? 'job_registry';
const tls = process.env.DOCUMENTDB_TLS ?? 'true';

// Shared by the migration runner (DOCUMENTDB_MIGRATION_URL) and the schema
// check (DOCUMENTDB_URL), so both apply the same validation and options.
function connection(url, variable) {
  if (!url) throw new Error(`${variable} is required`);
  if (!database?.trim()) throw new Error('DOCUMENTDB_DATABASE is required');
  if (!collection.trim()) throw new Error('DOCUMENTDB_COLLECTION is required');
  if (tls !== 'true' && tls !== 'false')
    throw new Error('DOCUMENTDB_TLS must be true or false');

  const parameters = new URLSearchParams(url.split('?')[1] || '');
  for (const [key, value] of parameters) {
    if (
      [
        'tlsinsecure',
        'tlsallowinvalidcertificates',
        'tlsallowinvalidhostnames',
      ].includes(key.toLowerCase()) &&
      value.toLowerCase() !== 'false'
    ) {
      throw new Error(`${variable} cannot disable TLS verification`);
    }
  }
  return {
    url,
    databaseName: database,
    options: {
      tls: tls === 'true',
      retryWrites: false,
      serverSelectionTimeoutMS: 5000,
      writeConcern: { w: 1 },
      readPreference: 'primary',
    },
  };
}

module.exports = {
  get mongodb() {
    return connection(
      process.env.DOCUMENTDB_MIGRATION_URL,
      'DOCUMENTDB_MIGRATION_URL',
    );
  },
  connection,
  migrationsDir: 'migrations/documentdb',
  changelogCollectionName: `${collection}__index_migrations`,
  migrationFileExtension: '.js',
  moduleSystem: 'commonjs',
  useFileHash: false,
  lockTtl: 0,
};
