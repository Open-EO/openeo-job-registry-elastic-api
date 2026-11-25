const indexes = [
  'user_id',
  'backend_id',
  'status',
  'infra_id',
  'application_id',
  'created',
  'updated',
].map((field) => ({ name: `${field}_1`, key: { [field]: 1 } }));

module.exports = {
  async up(db) {
    const collection = db.collection(
      process.env.DOCUMENTDB_COLLECTION ?? 'job_registry_v2',
    );
    for (const index of indexes) {
      await collection.createIndex(index.key, { name: index.name });
    }
  },
};
