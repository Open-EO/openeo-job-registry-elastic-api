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
}
