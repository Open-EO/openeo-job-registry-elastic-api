import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsNotEmpty, IsOptional } from 'class-validator';

export class PatchJob {
  @IsOptional()
  @ApiProperty({
    description: 'Proxy user used to execute the job',
    required: false,
  })
  proxy_user?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Status of the job',
    required: false,
  })
  status?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Version of the openEO API',
    required: false,
  })
  api_version?: string;

  @IsOptional()
  @ApiProperty({
    description: 'ID of the application linked to the job',
    required: false,
  })
  application_id?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Creation timestamp of the job',
    required: false,
  })
  created?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Last update timestamp of the job',
    required: false,
  })
  updated?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Start timestamp of the job',
    required: false,
  })
  started?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Finish timestamp of the job',
    required: false,
  })
  finished?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Title of the job',
    required: false,
  })
  title?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Description of the job',
    required: false,
  })
  description?: string;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'List of the dependencies of the job',
    required: false,
  })
  dependencies?: any[];

  @IsOptional()
  @ApiProperty({
    description: 'Status of the dependencies',
    required: false,
  })
  dependency_status?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Usage description of the dependencies',
    required: false,
  })
  dependency_usage?: string;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'Links related to the job',
    required: false,
  })
  links?: string[];

  @IsOptional()
  @ApiProperty({
    description: 'Assets related to the job',
    required: false,
  })
  assets?: any;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'Services that are executed by the job',
    required: false,
  })
  unique_process_ids?: string[];

  @IsOptional()
  @ApiProperty({
    description: 'Usage of different (external) services',
    required: false,
  })
  usage?: any;

  @IsOptional()
  @ApiProperty({
    description: 'Metadata about the batch job results and assets',
    required: false,
  })
  results_metadata?: any;

  @IsOptional()
  @ApiProperty({
    description: 'Total cost of the job',
    required: false,
  })
  costs?: number;
}

export class ExtendedPatchJob extends PatchJob {
  deleted?: boolean;
}

export class Job extends PatchJob {
  @IsNotEmpty()
  @ApiProperty({
    description: 'ID of the job',
  })
  job_id: string;

  @IsNotEmpty()
  @ApiProperty({
    description: 'ID of the backend that is posting the job',
  })
  backend_id: string;

  @IsOptional()
  @ApiProperty({
    description: 'ID of the parent job',
    required: false,
  })
  parent_id?: string;

  @IsNotEmpty()
  @ApiProperty({
    description: 'ID of the user who owns the job',
  })
  user_id: string;

  @IsOptional()
  @ApiProperty({
    description: 'Process graph of the job',
    required: false,
  })
  process?: any;

  @IsOptional()
  @ApiProperty({
    description: 'User specified options related to the job execution',
    required: false,
  })
  job_options?: any;
}
