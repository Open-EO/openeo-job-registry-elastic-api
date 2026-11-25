export const JOB_STORE_TYPES = [
  'elasticsearch',
  'postgresql',
  'documentdb',
] as const;
export type JobStoreType = typeof JOB_STORE_TYPES[number];
export const DEFAULT_JOB_STORE_TYPE: JobStoreType = 'elasticsearch';
