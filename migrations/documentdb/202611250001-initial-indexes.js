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
    const name = process.env.DOCUMENTDB_COLLECTION ?? 'job_registry';
    const existing = await db
      .listCollections({ name }, { nameOnly: true })
      .next();
    if (!existing) await db.createCollection(name);
    const collection = db.collection(name);
    for (const index of indexes) {
      await collection.createIndex(index.key, { name: index.name });
    }
  },
};
