import {
  Body,
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import { Job } from '../../models/job.dto';
import { DatabaseService } from '../../services/database/database.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private databaseService: DatabaseService,
    private logger: Logger,
  ) {}

  @Post()
  @ApiOperation({
    tags: ['jobs'],
    summary: 'Report a list of jobs and save them to the database',
  })
  @ApiBody({
    type: Job,
    isArray: true,
  })
  async storeJobs(@Body() jobs: Job[]): Promise<Job[]> {
    return this.databaseService.saveJobs(jobs);
  }

  @Post('/search')
  @ApiOperation({
    tags: ['jobs'],
    summary: 'Search for reported jobs using an ElasticSearch query',
  })
  @ApiBody({
    description: 'Query supported by ElasticSearch',
    required: true,
  })
  async queryJobs(@Body() query: any): Promise<Job[]> {
    try {
      const jobs: Job[] = await this.databaseService.queryJobs(query);
      return jobs;
    } catch (error: any) {
      this.logger.error(`Could not query jobs`, error, JobsController.name);
      throw new InternalServerErrorException(
        `Could not query jobs: ${error.message}`,
      );
    }
  }
}
