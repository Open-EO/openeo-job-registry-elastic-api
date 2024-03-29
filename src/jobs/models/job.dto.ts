import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class JobDependency {
  @IsOptional()
  @ApiProperty({
    description: 'ID of the collection',
    required: false,
  })
  collection_id?: string;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'Batch request IDs',
    required: false,
  })
  batch_request_ids?: string[];

  @IsOptional()
  @ApiProperty({
    description: 'URL where the results are stored',
    required: false,
  })
  results_location?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Card4L flag',
    required: false,
  })
  card4l?: boolean;
}

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
  @ValidateNested({ each: true })
  @Type(() => JobDependency)
  @IsArray()
  @ApiProperty({
    description: 'List of the dependencies of the job',
    required: false,
  })
  dependencies?: JobDependency[];

  @IsOptional()
  @ApiProperty({
    description: 'Status of the dependencies',
    required: false,
  })
  dependency_status?: string;

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
