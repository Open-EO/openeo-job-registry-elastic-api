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
   * Given an ElasticSearch query, return the list of jobs that matches the query
   * @param query
   */
  public async queryJobs(query: any): Promise<Job[]> {
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
      size: 1000,
    });
    queue.push(results);

    while (queue.length) {
      const { body } = queue.shift();
      jobs = [...jobs, ...body.hits.hits.map((h) => h._source)];

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
}
