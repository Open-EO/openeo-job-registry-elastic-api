import {
  Body,
  Controller,
  Delete,
  HttpCode,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import { Job, PatchJob } from '../../models/job.dto';
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
    summary: 'Report a job and save it to the database',
  })
  @ApiBody({
    type: Job,
    isArray: false,
  })
  async storeJobs(@Body() job: Job): Promise<Job> {
    const jobs: Job[] = await this.databaseService.saveJobs([job]);
    return jobs[0];
  }

  @Post('/search')
  @HttpCode(200)
  @ApiOperation({
    tags: ['jobs'],
    summary: 'Search for reported jobs using an ElasticSearch query',
  })
  @ApiBody({
    type: Object,
    description: 'Query supported by ElasticSearch',
    required: true,
  })
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

  @Patch('/:id')
  @ApiOperation({
    tags: ['jobs'],
    summary: 'Update the information of an existing job',
  })
  @ApiBody({
    type: PatchJob,
    required: true,
  })
  async patchJob(
    @Param('id') jobId: string,
    @Body() update: PatchJob,
  ): Promise<Job> {
    // Check if the job to update exists in the database
    const jobID: string = await this.checkIfJobExists(jobId);

    // Partially update the document
    return this.databaseService.patchJob(jobID, update);
  }

  @Delete('/:id')
  @ApiOperation({
    tags: ['jobs'],
    summary: 'Mark a document as deleted',
  })
  async deleteJob(@Param('id') jobId: string): Promise<void> {
    // Check if the job to update exists in the database
    const jobID: string = await this.checkIfJobExists(jobId);

    // Partially update the document
    await this.databaseService.patchJob(jobID, {
      deleted: true,
    });
  }

  /**
   * Helper function to verify if job exists in the database. If not, throw an exception
   * @param id - ID of the job to check
   * @private
   */
  private async checkIfJobExists(id: string) {
    const jobID: string = await this.databaseService.getJobDocId(id);
    if (!jobID) {
      throw new NotFoundException(`Could not find job with ${id}`);
    }
    return jobID;
  }
}
