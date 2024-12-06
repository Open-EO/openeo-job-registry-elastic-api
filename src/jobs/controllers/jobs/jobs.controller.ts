import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  HttpCode,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Job, PatchJob } from '../../models/job.dto';
import { DatabaseService } from '../../services/database/database.service';
import { CachingService } from '../../../caching/services/cache.service';
import { Pagination } from '../../models/pagination.dto';

@Controller('jobs')
export class JobsController {
  constructor(
    private databaseService: DatabaseService,
    private cachingService: CachingService,
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
    return await this.databaseService.saveJobs(job);
  }

  @Post('/search/paginated')
  @HttpCode(200)
  @ApiOperation({
    tags: ['jobs'],
    summary: 'Paginated search for reported jobs using an ElasticSearch query',
  })
  @ApiBody({
    type: Object,
    description: 'Query supported by ElasticSearch',
    required: true,
  })
  @ApiQuery({
    name: 'size',
    type: Number,
    description: 'Number of elements to return on each page',
    required: false,
  })
  @ApiQuery({
    name: 'page',
    type: Number,
    description: 'Page number to request',
    required: false,
  })
  async queryJobsPaginated(
    @Body() query: any,
    @Query('size', new DefaultValuePipe(10), ParseIntPipe) size: number,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
  ): Promise<Pagination> {
    try {
      const cacheKey = `paginated_search_result_${btoa(
        JSON.stringify(query),
      )}_${size}_${page}`;
      let result = await this.cachingService.checkCache<Pagination>(cacheKey);

      if (!result) {
        result = await this.databaseService.queryJobs(query, page, size, false);
        await this.cachingService.store(cacheKey, result);
      }

      return result;
    } catch (error: any) {
      this.logger.error(
        `Could not query paginated jobs: ${JSON.stringify(error)}`,
        error,
        JobsController.name,
      );
      throw new InternalServerErrorException(
        `Could not query paginated jobs: ${error.message}`,
      );
    }
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
      const cacheKey = `search_result_${btoa(JSON.stringify(query))}`;
      let jobs: Job[] = await this.cachingService.checkCache<Job[]>(cacheKey);

      if (!jobs) {
        const result = await this.databaseService.queryJobs(query);
        jobs = result.jobs as Job[];
        await this.cachingService.store(cacheKey, jobs);
      }

      return jobs;
    } catch (error: any) {
      this.logger.error(
        `Could not query jobs: ${JSON.stringify(error)}`,
        error,
        JobsController.name,
      );
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
