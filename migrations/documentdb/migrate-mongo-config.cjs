const url = process.env.DOCUMENTDB_MIGRATION_URL;
const database = process.env.DOCUMENTDB_DATABASE;
const collection = process.env.DOCUMENTDB_COLLECTION ?? 'job_registry';
const tls = process.env.DOCUMENTDB_TLS ?? 'true';

module.exports = {
  get mongodb() {
    if (!url) throw new Error('DOCUMENTDB_MIGRATION_URL is required');
    if (!database?.trim()) throw new Error('DOCUMENTDB_DATABASE is required');
    if (!collection.trim())
      throw new Error('DOCUMENTDB_COLLECTION is required');
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
        throw new Error(
          'DOCUMENTDB_MIGRATION_URL cannot disable TLS verification',
        );
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
  },
  migrationsDir: 'migrations/documentdb',
  changelogCollectionName: `${collection}__index_migrations`,
  migrationFileExtension: '.js',
  moduleSystem: 'commonjs',
  useFileHash: false,
  lockTtl: 0,
};
