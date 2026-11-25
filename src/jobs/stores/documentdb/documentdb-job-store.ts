import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BSON,
  Collection,
  Db,
  Filter,
  MongoClient,
  MongoServerError,
} from 'mongodb';
import { ConfigService } from '../../../config/config/config.service';
import { Job, SearchJobs } from '../../models/job.v2.dto';
import {
  JobSource,
  JobStore,
  JobStoreConflictError,
  JobStoreHealth,
  JobStoreInvalidInputError,
  JobStoreNotFoundError,
  JobStoreUnavailableError,
  StoredJob,
  StoredJobPage,
} from '../job-store';

interface JobDocument {
  _id: string;
  data: Record<string, string>;
  version: string;
  backend_id: string;
  user_id: string;
  status: string | null;
  infra_id: string | null;
  application_id: string | null;
  created: number | null;
  updated: number | null;
  deleted: boolean;
}

@Injectable()
export class DocumentdbJobStore extends JobStore implements OnModuleDestroy {
  private readonly client: MongoClient;
  private readonly database: Db;
  private readonly collection: Collection<JobDocument>;

  constructor(config: ConfigService) {
    super();
    this.logger = new Logger(DocumentdbJobStore.name);
    this.client = new MongoClient(config.getDocumentdb('url'), {
      tls: config.getDocumentdb('tls'),
      retryWrites: false,
      serverSelectionTimeoutMS: 5000,
      writeConcern: { w: 1 },
      readPreference: 'primary',
    });
    this.database = this.client.db(config.getDocumentdb('database'));
    this.collection = this.database.collection<JobDocument>(
      config.getDocumentdb('collection'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  async checkHealth(): Promise<JobStoreHealth> {
    try {
      const exists = await this.database
        .listCollections(
          { name: this.collection.collectionName },
          { nameOnly: true },
        )
        .hasNext();
      if (!exists) throw new Error('Job collection does not exist');
      await this.collection.findOne({}, { projection: { _id: 1 } });
      return { name: 'documentdb', status: 'up' };
    } catch {
      this.logger.error('DocumentDB job storage health check failed');
      return { name: 'documentdb', status: 'down' };
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (
        error instanceof JobStoreConflictError ||
        error instanceof JobStoreInvalidInputError ||
        error instanceof JobStoreNotFoundError
      ) {
        throw error;
      }
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new JobStoreConflictError();
      }
      this.logger.error('DocumentDB job storage operation failed');
      throw new JobStoreUnavailableError();
    }
  }

  private timestamp(value: string | null | undefined): number | null {
    if (value == null) return null;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp))
      throw new JobStoreInvalidInputError('Invalid job timestamp');
    return timestamp;
  }

  private document(source: JobSource, version: string): JobDocument {
    const normalized = { ...source };
    for (const field of [
      'created',
      'updated',
      'started',
      'finished',
    ] as const) {
      if (normalized[field] != null) {
        normalized[field] = new Date(
          this.timestamp(normalized[field]),
        ).toISOString();
      }
    }
    const data: Record<string, string> = {};
    for (const [field, value] of Object.entries(normalized)) {
      if (value !== undefined) data[field] = JSON.stringify(value);
    }
    const document: JobDocument = {
      _id: source.job_id,
      data,
      version,
      backend_id: source.backend_id,
      user_id: source.user_id,
      status: source.status ?? null,
      infra_id: source.infra_id ?? null,
      application_id: source.application_id ?? null,
      created: this.timestamp(source.created),
      updated: this.timestamp(source.updated),
      deleted: source.deleted ?? false,
    };
    if (BSON.calculateObjectSize(document) > 16 * 1024 * 1024) {
      throw new JobStoreInvalidInputError(
        'Job exceeds the DocumentDB document size limit',
      );
    }
    return document;
  }

  private record(document: JobDocument): StoredJob {
    const source = this.source(document.data);
    if (
      typeof source.job_id !== 'string' ||
      typeof source.backend_id !== 'string' ||
      typeof source.user_id !== 'string'
    ) {
      throw new Error('Stored job is missing its identity');
    }
    return {
      source: {
        ...source,
        job_id: source.job_id,
        backend_id: source.backend_id,
        user_id: source.user_id,
      },
      concurrencyToken: document.version,
    };
  }

  private source(data: Record<string, string>): Partial<JobSource> {
    const source = {};
    for (const [field, value] of Object.entries(data)) {
      Object.assign(source, { [field]: JSON.parse(value) });
    }
    return source;
  }

  create(source: JobSource): Promise<StoredJob> {
    return this.execute(async () => {
      this.debug('job_store_create', source.job_id);
      const document = this.document(source, randomUUID());
      await this.collection.insertOne(document);
      return this.record(document);
    });
  }

  get(jobId: string): Promise<StoredJob> {
    return this.execute(async () => {
      this.debug('job_store_get', jobId);
      const document = await this.collection.findOne({ _id: jobId });
      if (!document) throw new JobStoreNotFoundError();
      return this.record(document);
    });
  }

  replace(source: JobSource, concurrencyToken: string): Promise<StoredJob> {
    return this.execute(async () => {
      this.debug('job_store_replace', source.job_id);
      const document = this.document(source, randomUUID());
      const result = await this.collection.replaceOne(
        { _id: source.job_id, version: concurrencyToken },
        document,
      );
      if (result.matchedCount !== 1) throw new JobStoreConflictError();
      return this.record(document);
    });
  }

  search(search: SearchJobs): Promise<StoredJobPage> {
    return this.execute(async () => {
      this.debug('job_store_search');
      const filters = search.filters || {};
      const clauses: Filter<JobDocument>[] = [{ deleted: false }];
      if (filters.job_id !== undefined) clauses.push({ _id: filters.job_id });
      if (filters.backend_id !== undefined)
        clauses.push({ backend_id: filters.backend_id });
      if (filters.infra_id !== undefined)
        clauses.push({ infra_id: filters.infra_id });
      if (filters.user_ids !== undefined)
        clauses.push({ user_id: { $in: filters.user_ids } });
      if (filters.statuses !== undefined)
        clauses.push({ status: { $in: filters.statuses } });
      if (filters.has_application_id !== undefined)
        clauses.push({
          application_id: filters.has_application_id ? { $ne: null } : null,
        });
      for (const [field, since, until] of [
        ['created', filters.created_since, filters.created_until],
        ['updated', filters.updated_since, filters.updated_until],
      ] as const) {
        if (since !== undefined)
          clauses.push({ [field]: { $gte: this.timestamp(since) } });
        if (until !== undefined)
          clauses.push({ [field]: { $lte: this.timestamp(until) } });
      }
      if (search.position) {
        const { created, job_id } = search.position;
        if (job_id === null)
          throw new JobStoreInvalidInputError(
            'DocumentDB pagination requires a job ID',
          );
        clauses.push(
          created === null
            ? { created: null, _id: { $gt: job_id } }
            : {
                $or: [
                  { created: { $lt: created } },
                  { created: null },
                  { created, _id: { $gt: job_id } },
                ],
              },
        );
      }
      const projection = search.fields
        ? Object.fromEntries([
            ['_id', 1],
            ['created', 1],
            ...search.fields.map((field) => [`data.${field}`, 1]),
          ])
        : undefined;
      const documents = await this.collection
        .find({ $and: clauses }, { projection })
        .sort({ created: -1, _id: 1 })
        .limit(search.limit + 1)
        .toArray();
      const page = documents.slice(0, search.limit);
      const last = page[page.length - 1];
      return {
        jobs: page.map((document) => {
          const source = this.source(document.data ?? {});
          if (!search.fields) return source;
          const result: Partial<Job> = {};
          for (const field of search.fields) {
            if (Object.prototype.hasOwnProperty.call(source, field)) {
              Object.assign(result, { [field]: source[field] });
            }
          }
          return result;
        }),
        next_position:
          documents.length > search.limit
            ? { created: last.created, job_id: last._id }
            : null,
      };
    });
  }
}
