import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { estypes } from '@elastic/elasticsearch';
import { ResponseError } from '@elastic/elasticsearch/lib/errors';
import { ConfigService } from '../../../config/config/config.service';
import { ElasticsearchHealthProbe } from './elasticsearch-health-probe';
import { SearchJobs } from '../../models/job.v2.dto';
import {
  JobSource,
  JobStore,
  JobStoreConflictError,
  JobStoreInvalidInputError,
  JobStoreNotFoundError,
  JobStoreUnavailableError,
  JobStoreHealth,
  StoredJob,
  StoredJobPage,
} from '../job-store';

@Injectable()
export class ElasticsearchJobStore extends JobStore {
  private readonly index: string;
  private readonly hosts: string[];

  constructor(
    private readonly elastic: ElasticsearchService,
    config: ConfigService,
    private readonly healthProbe: ElasticsearchHealthProbe,
  ) {
    super();
    this.index = config.getElasticsearch('jobsIdx');
    this.hosts = config.getElasticsearchHosts();
    this.logger = new Logger(ElasticsearchJobStore.name);
  }

  checkHealth(): Promise<JobStoreHealth> {
    return this.healthProbe.check(this.hosts, this.index);
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (
        error instanceof JobStoreInvalidInputError ||
        error instanceof JobStoreConflictError ||
        error instanceof JobStoreNotFoundError
      ) {
        throw error;
      }
      if (error instanceof ResponseError) {
        if (error.statusCode === 409) throw new JobStoreConflictError();
        if (error.statusCode === 404) throw new JobStoreNotFoundError();
      }
      this.logger.error('Job storage operation failed');
      throw new JobStoreUnavailableError();
    }
  }

  private record(
    source: JobSource,
    metadata: { _seq_no?: number; _primary_term?: number },
  ): StoredJob {
    if (
      !Number.isInteger(metadata._seq_no) ||
      metadata._seq_no < 0 ||
      !Number.isInteger(metadata._primary_term) ||
      metadata._primary_term < 1
    ) {
      throw new Error('Storage returned invalid concurrency metadata');
    }
    return {
      source: this.fromStorage(source),
      concurrencyToken: JSON.stringify([
        metadata._seq_no,
        metadata._primary_term,
      ]),
    };
  }

  private fromStorage<T extends Partial<JobSource>>(source: T): T {
    if (
      source._registry?.processWasSerialized &&
      source.process !== null &&
      (typeof source.process === 'object' || typeof source.process === 'string')
    ) {
      const process =
        typeof source.process === 'string'
          ? JSON.parse(source.process)
          : source.process;
      return { ...source, process: JSON.stringify(process) };
    }
    return source;
  }

  private toStorage(source: JobSource): JobSource {
    if (
      !source._registry?.processWasSerialized ||
      typeof source.process !== 'string'
    ) {
      return source;
    }
    const process: JobSource['process'] = JSON.parse(source.process);
    if (
      typeof process !== 'object' ||
      process === null ||
      Array.isArray(process)
    ) {
      throw new JobStoreInvalidInputError(
        'process must be an object or a JSON-encoded object',
      );
    }
    return { ...source, process };
  }

  get(jobId: string): Promise<StoredJob> {
    return this.execute(async () => {
      this.debug('job_store_get', jobId);
      const { body } = await this.elastic.get<estypes.GetResponse<JobSource>>({
        index: this.index,
        id: jobId,
      });
      return this.record(body._source, body);
    });
  }

  create(source: JobSource): Promise<StoredJob> {
    return this.execute(async () => {
      this.debug('job_store_create', source.job_id);
      const { body } = await this.elastic.create<estypes.CreateResponse>({
        index: this.index,
        id: source.job_id,
        body: this.toStorage(source),
        refresh: 'wait_for',
      });
      return this.record(source, body);
    });
  }

  replace(source: JobSource, concurrencyToken: string): Promise<StoredJob> {
    return this.execute(async () => {
      this.debug('job_store_replace', source.job_id);
      const token: unknown = JSON.parse(concurrencyToken);
      if (
        !Array.isArray(token) ||
        token.length !== 2 ||
        !token.every((value) => Number.isInteger(value) && value >= 0) ||
        token[1] < 1
      ) {
        throw new Error('Invalid storage concurrency token');
      }
      const { body } = await this.elastic.index<estypes.IndexResponse>({
        index: this.index,
        id: source.job_id,
        if_seq_no: token[0],
        if_primary_term: token[1],
        refresh: 'wait_for',
        body: this.toStorage(source),
      });
      return this.record(source, body);
    });
  }

  search(search: SearchJobs): Promise<StoredJobPage> {
    return this.execute(async () => {
      this.debug('job_store_search');
      const filters = search.filters || {};
      const termFilters = [
        ['backend_id', filters.backend_id],
        ['job_id', filters.job_id],
      ] as const;
      const termsFilters = [
        ['user_id', filters.user_ids],
        ['status', filters.statuses],
      ] as const;
      const filter: estypes.QueryDslQueryContainer[] = [
        ...termFilters.flatMap(([field, value]) =>
          value === undefined ? [] : [{ term: { [field]: value } }],
        ),
        ...termsFilters.flatMap(([field, value]) =>
          value === undefined ? [] : [{ terms: { [field]: value } }],
        ),
        ...(filters.infra_id !== undefined
          ? [{ term: { infra_id: filters.infra_id } }]
          : []),
        ...(filters.has_application_id
          ? [{ exists: { field: 'application_id' } }]
          : []),
      ];
      const mustNot: estypes.QueryDslQueryContainer[] = [
        { term: { deleted: true } },
        ...(filters.has_application_id === false
          ? [{ exists: { field: 'application_id' } }]
          : []),
      ];
      for (const [field, since, until] of [
        ['created', filters.created_since, filters.created_until],
        ['updated', filters.updated_since, filters.updated_until],
      ] as const) {
        if (since || until) {
          filter.push({
            range: {
              [field]: {
                ...(since ? { gte: since } : {}),
                ...(until ? { lte: until } : {}),
              },
            },
          });
        }
      }
      const query = { bool: { filter, must_not: mustNot } };
      const after = search.position
        ? [search.position.created, search.position.job_id]
        : undefined;
      const { body } = await this.elastic.search<
        estypes.SearchResponse<Partial<JobSource>>
      >({
        index: this.index,
        size: search.limit + 1,
        body: {
          query,
          track_total_hits: false,
          _source: search.fields
            ? [
                ...search.fields,
                ...(search.fields.includes('process') ? ['_registry'] : []),
              ]
            : { excludes: ['deleted'] },
          sort: [{ created: 'desc' }, { job_id: 'asc' }],
          ...(after ? { search_after: after } : {}),
        },
      });
      const hits = body.hits.hits;
      const page = hits.slice(0, search.limit);
      const more = hits.length > search.limit;
      const last = page[page.length - 1];
      const createdSortValue = last?.sort?.[0];
      if (
        more &&
        (!last.sort ||
          last.sort.length !== 2 ||
          !(
            createdSortValue === null ||
            (typeof createdSortValue === 'number' &&
              Number.isFinite(createdSortValue))
          ) ||
          !(last.sort[1] === null || typeof last.sort[1] === 'string'))
      ) {
        throw new Error('Storage returned an invalid pagination position');
      }
      return {
        jobs: page.map((hit) => this.fromStorage(hit._source)),
        next_position: more
          ? {
              created:
                typeof createdSortValue === 'number' &&
                createdSortValue > -Number.MAX_SAFE_INTEGER
                  ? createdSortValue
                  : null,
              job_id: typeof last.sort[1] === 'string' ? last.sort[1] : null,
            }
          : null,
      };
    });
  }
}
