import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Job } from '../../models/job.dto';

@Controller('jobs')
export class JobsController {
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
    return jobs;
  }
}
