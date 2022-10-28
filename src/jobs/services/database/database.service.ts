import { Injectable } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { Job } from '../../models/job.dto';
import { ConfigService } from '../../../config/config/config.service';

@Injectable()
export class DatabaseService {
  private JOBS_INDEX = '';

  constructor(
    private configService: ConfigService,
    private elasticSearch: ElasticsearchService,
  ) {
    this.JOBS_INDEX = this.configService.get('database.jobsIdx');
  }

  /**
   * Save a list of jobs to the database
   * @param jobs - List of OpenEO jobs
   */
  public async saveJobs(jobs: Job[]): Promise<Job[]> {
    const body = [].concat(
      ...jobs.map((j: Job) => [{ index: { _index: this.JOBS_INDEX } }, j]),
    );
    await this.elasticSearch.bulk({
      body,
    });
    return jobs;
  }

  /**
   * Get the job information for a specific ID
   * @param id - ID of the job to search for
   */
  public async getJobByJobId(id: string): Promise<Job> {
    const jobs = (await this.queryJobs(this.getJobQuery(id), 1)) as Job[];
    return jobs.length > 0 ? jobs[0] : undefined;
  }

  /**
   * Given an ElasticSearch query, return the list of jobs that matches the query
   * @param query - ElasticSearch query to execute
   * @param limit - The amount of documents to fetch (optional)
   * @param idsOnly - Only return the IDs of the document
   */
  public async queryJobs(
    query: any,
    limit?: number,
    idsOnly?: boolean,
  ): Promise<Job[] | string[]> {
    const queue = [];
    let jobs: Job[] = [];

    if (Object.keys(query).length === 0) {
      throw new Error(`empty query`);
    }
    // Perform initial search
    const results = await this.elasticSearch.search({
      index: this.JOBS_INDEX,
      scroll: '5s',
      body: query,
      size: limit || 1000,
    });
    queue.push(results);

    while (queue.length) {
      const { body } = queue.shift();
      jobs = [
        ...jobs,
        ...body.hits.hits.map((h) => (idsOnly ? h._id : h._source)),
      ];

      if (body.hits.total.value === jobs.length) {
        break;
      }
      queue.push(
        await this.elasticSearch.scroll({
          scroll_id: body._scroll_id,
          scroll: '5s',
        }),
      );
    }
    return jobs;
  }

  /**
   * Partially update a document in ElasticSearch
   * @param docId - ID of the ElasticSearch document to update
   * @param update - Partial update that should be applied
   */
  async patchJob(docId: string, update: Job): Promise<Job> {
    await this.elasticSearch.update({
      index: this.JOBS_INDEX,
      id: docId,
      body: {
        doc: update,
      },
    });
    const updated = await this.elasticSearch.get({
      index: this.JOBS_INDEX,
      id: docId,
    });
    return updated.body._source as Job;
  }

  /**
   * Get the elasticsearch document ID of the job linked to the specified job id
   * @param jobId - Job ID to search for
   */
  async getJobDocId(jobId: string): Promise<string> {
    const ids: string[] = (await this.queryJobs(
      this.getJobQuery(jobId),
      1,
      true,
    )) as string[];
    return ids.length > 0 ? ids[0] : undefined;
  }

  /**
   * Create the ElasticSearch job query based on a job id
   * @param id - Job ID to search for
   */
  private getJobQuery = (id: string): any => ({
    query: {
      bool: {
        must: [
          {
            match: {
              job_id: id,
            },
          },
        ],
      },
    },
  });
}
