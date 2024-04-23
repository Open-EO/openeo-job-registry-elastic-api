import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { ExtendedPatchJob, Job } from '../../models/job.dto';
import { ConfigService } from '../../../config/config/config.service';
import { UtilsService } from '../../../utils/services/utils/utils.service';
import { ApiResponse } from '@elastic/elasticsearch';

@Injectable()
export class DatabaseService {
  private JOBS_INDEX = '';

  constructor(
    private configService: ConfigService,
    private elasticSearch: ElasticsearchService,
    private logger: Logger,
  ) {
    this.JOBS_INDEX = this.configService.get('database.jobsIdx');
  }

  /**
   * Save a list of jobs to the database
   * @param job - OpenEO job to store
   */
  public async saveJobs(job: Job): Promise<Job> {
    try {
      const response: ApiResponse<Record<string, any>> =
        await this.elasticSearch.index({
          index: this.JOBS_INDEX,
          body: job,
        });

      if (response.statusCode !== 201) {
        throw new Error(
          `Could not save jobs to elasticsearch: ${JSON.stringify(
            response.body,
          )}`,
        );
      }
      return job;
    } catch (error: any) {
      let message = error.toString();
      if (error.constructor.name === 'ResponseError') {
        message = `${error.meta.body.error.type} - ${error.meta.body.error.reason}`;
      }
      this.logger.error(
        `Could not store job ${job.job_id} in elasticsearch: ${message}`,
      );
      throw new HttpException(
        `Could not store jobs in database: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Given an ElasticSearch query, return the list of jobs that matches the query
   * @param query - ElasticSearch query to execute
   * @param deleted - Flag indicating if the deleted docs should be included (true) or not (false)
   * @param limit - The amount of documents to fetch (optional)
   * @param idsOnly - Only return the IDs of the document
   */

  /* istanbul ignore next */
  public async queryJobs(
    query: any,
    deleted?: boolean,
    limit?: number,
    idsOnly?: boolean,
  ): Promise<Job[] | string[]> {
    let retries = 1;

    while (retries <= 5) {
      const results = await this.executeJobQuery(
        query,
        deleted,
        limit,
        idsOnly,
      );

      if (results.length > 0) {
        return results;
      } else {
        await UtilsService.sleep(500);
        retries++;
      }
    }
    return [];
  }

  /**
   * Execute a query on the jobs index.
   * @param query - ElasticSearch query to execute
   * @param deleted - Flag indicating if the deleted docs should be included (true) or not (false)
   * @param limit - The amount of documents to fetch (optional)
   * @param idsOnly - Only return the IDs of the document
   */

  /* istanbul ignore next */
  public async executeJobQuery(
    query: any,
    deleted?: boolean,
    limit?: number,
    idsOnly?: boolean,
  ): Promise<Job[] | string[]> {
    const queue = [];
    let jobs: Job[] = [];

    if (Object.keys(query).length === 0) {
      throw new Error(`empty query`);
    }

    if (!deleted) {
      query = this.addDeletedFilter(query);
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
  async patchJob(docId: string, update: ExtendedPatchJob): Promise<Job> {
    try {
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
    } catch (error: any) {
      let message = error.toString();
      if (error.constructor.name === 'ResponseError') {
        message = `${error.meta.body.error.type} - ${error.meta.body.error.reason}`;
      }
      this.logger.error(
        `Could not update job ${docId} in elasticsearch: ${message}`,
      );
      throw new HttpException(
        `Could not update jobs in database: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get the elasticsearch document ID of the job linked to the specified job id
   * @param jobId - Job ID to search for
   */
  async getJobDocId(jobId: string): Promise<string> {
    const ids: string[] = (await this.queryJobs(
      this.getJobQuery(jobId),
      false,
      1,
      true,
    )) as string[];
    return ids.length > 0 ? ids[0] : undefined;
  }

  /**
   * Adds a filter to the request body to filter out the docs that are marked for deletion
   * @param body - Body that is sent to ES
   */
  addDeletedFilter(body: any): any {
    return {
      ...body,
      query: {
        ...body?.query,
        bool: {
          ...body?.query?.bool,
          must_not: [
            ...(body?.query?.bool?.must_not || []),
            {
              term: {
                deleted: 'true',
              },
            },
          ],
        },
      },
    };
  }

  /**
   * Create the ElasticSearch job query based on a job id
   * @param id - Job ID to search for
   */
  /* istanbul ignore next */
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
