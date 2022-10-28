import {
  BadRequestException,
  Body,
  Controller,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import { Job } from '../../models/job.dto';
import { DatabaseService } from '../../services/database/database.service';
import { Public } from '../../../auth/decorators/public.decorator';

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
    type: Object,
    description: 'Query supported by ElasticSearch',
    required: true,
  })
  @Public()
  async queryJobs(@Body() query: any): Promise<Job[]> {
    try {
      return (await this.databaseService.queryJobs(query)) as Job[];
    } catch (error: any) {
      this.logger.error(`Could not query jobs`, error, JobsController.name);
      throw new InternalServerErrorException(
        `Could not query jobs: ${error.message}`,
      );
    }
  }

  @Patch()
  @ApiOperation({
    tags: ['jobs'],
    summary: 'Update the information of an existing job',
  })
  @ApiBody({
    type: Job,
    required: true,
  })
  async patchJob(@Body() update: Job): Promise<Job> {
    if (!update.job_id) {
      throw new BadRequestException(`No job_id specified in body`);
    }
    // Check if the job to update exists in the database
    const jobID: string = await this.databaseService.getJobDocId(update.job_id);
    if (!jobID) {
      throw new NotFoundException(`Could not find job with ${update.job_id}`);
    }

    // Partially update the document
    return this.databaseService.patchJob(jobID, update);
  }
}
