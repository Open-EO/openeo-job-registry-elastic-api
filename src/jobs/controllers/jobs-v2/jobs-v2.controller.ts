import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JobRegistryService } from '../../services/job-registry.service';
import {
  CreateJob,
  ListUserJobs,
  ListActiveJobs,
  ListCleanupCandidates,
  UpdateJob,
} from '../../models/job.v2.dto';

@ApiTags('jobs-v2')
@Controller('v2/jobs')
export class JobsController {
  constructor(private readonly registry: JobRegistryService) {}

  @Post()
  @ApiOperation({ summary: 'Create a job using the domain contract' })
  async create(
    @Body() job: CreateJob,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.registry.create(job);
    response.setHeader('ETag', result.etag);
    response.setHeader(
      'Location',
      `/v2/jobs/${encodeURIComponent(result.job.job_id)}`,
    );
    return result.job;
  }

  @Post('user')
  @HttpCode(200)
  @ApiOperation({ summary: 'List jobs belonging to a user' })
  listUserJobs(@Body() query: ListUserJobs) {
    return this.registry.listUserJobs(query);
  }

  @Post('active')
  @HttpCode(200)
  @ApiOperation({ summary: 'List created, queued and running jobs' })
  listActiveJobs(@Body() query: ListActiveJobs) {
    return this.registry.listActiveJobs(query);
  }

  @Post('cleanup-candidates')
  @HttpCode(200)
  @ApiOperation({
    summary: 'List non-created jobs updated at or before a cutoff',
  })
  listCleanupCandidates(@Body() query: ListCleanupCandidates) {
    return this.registry.listCleanupCandidates(query);
  }

  @Get(':jobId')
  async get(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.registry.get(jobId);
    response.setHeader('ETag', result.etag);
    return result.job;
  }

  @Patch(':jobId')
  @ApiHeader({
    name: 'If-Match',
    required: false,
    description:
      'Optional strong ETag. When supplied, enables strict concurrency checking; conflicts without it return 409.',
  })
  async patch(
    @Param('jobId') jobId: string,
    @Body() update: UpdateJob,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.registry.patch(jobId, update, ifMatch);
    response.setHeader('ETag', result.etag);
    return result.job;
  }

  @Delete(':jobId')
  @HttpCode(204)
  @ApiHeader({
    name: 'If-Match',
    required: false,
    description:
      'Optional strong ETag. When supplied, enables strict concurrency checking; conflicts without it return 409.',
  })
  async delete(
    @Param('jobId') jobId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.registry.delete(jobId, ifMatch);
  }
}
