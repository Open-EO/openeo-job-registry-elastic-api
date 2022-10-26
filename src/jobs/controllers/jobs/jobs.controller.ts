import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Job } from '../../models/job.dto';
import { DatabaseService } from '../../services/database/database.service';

@Controller('jobs')
export class JobsController {
  constructor(private databaseService: DatabaseService) {}

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
}
