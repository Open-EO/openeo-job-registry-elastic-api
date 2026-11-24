import { Logger } from '@nestjs/common';
import {
  Job,
  SearchJobs,
  JobContinuation,
  JobPosition,
} from '../models/job.v2.dto';

export interface VersionedJob {
  job: Job;
  etag: string;
}

export interface JobPage {
  jobs: Partial<Job>[];
  next_page: JobContinuation | null;
}

export interface RegistryState {
  etag: string;
  creationFingerprint: string;
}

export type JobSource = Job & { deleted?: boolean; _registry?: RegistryState };

export interface StoredJob {
  source: JobSource;
  concurrencyToken: string;
}

export interface StoredJobPage {
  jobs: Partial<JobSource>[];
  next_position: JobPosition | null;
}

export interface JobStoreHealth {
  name: string;
  status: 'up' | 'down';
  warnings?: string[];
  errors?: string[];
}

export class JobStoreConflictError extends Error {}
export class JobStoreNotFoundError extends Error {}
export class JobStoreInvalidInputError extends Error {}
export class JobStoreUnavailableError extends Error {}

export abstract class JobStore {
  protected logger = new Logger(JobStore.name);

  abstract create(source: JobSource): Promise<StoredJob>;
  abstract get(jobId: string): Promise<StoredJob>;
  abstract replace(
    source: JobSource,
    concurrencyToken: string,
  ): Promise<StoredJob>;
  abstract search(search: SearchJobs): Promise<StoredJobPage>;
  abstract checkHealth(): Promise<JobStoreHealth>;

  protected debug(event: string, jobId?: string): void {
    this.logger.debug(
      JSON.stringify({
        event,
        ...(jobId !== undefined ? { job_id: jobId } : {}),
      }),
    );
  }
}
