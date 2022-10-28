import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  MaxLength,
  MinLength,
  minLength,
  Validate,
  ValidateNested,
} from 'class-validator';

export class JobArea {
  @IsPositive()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Value of the area processed',
  })
  value: number;

  @IsNotEmpty()
  @ApiProperty({
    description: 'Unit of the area processed',
  })
  unit: string;
}

export class JobDependency {
  @IsOptional()
  @ApiProperty({
    description: 'ID of the collection',
  })
  collection_id?: string;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'Batch request IDs',
  })
  batch_request_ids?: string[];

  @IsOptional()
  @ApiProperty({
    description: 'URL where the results are stored',
  })
  results_location?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Card4L flag',
  })
  card4l?: boolean;
}

export class Job {
  @IsNotEmpty()
  @ApiProperty({
    description: 'ID of the job',
  })
  job_id: string;

  @IsOptional()
  @ApiProperty({
    description: 'ID of the parent job',
  })
  parent_id?: string;

  @IsOptional()
  @ApiProperty({
    description: 'ID of the user who executed the job',
  })
  user_id?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Proxy user used to execute the job',
  })
  proxy_user?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Status of the job',
  })
  status?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Version of the openEO API',
  })
  api_version?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Processing graph used by the job',
  })
  specification?: any;

  @IsOptional()
  @ApiProperty({
    description: 'ID of the application linked to the job',
  })
  application_id?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Creation timestamp of the job',
  })
  created?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Last update timestamp of the job',
  })
  updated?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Start timestamp of the job',
  })
  started?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Finish timestamp of the job',
  })
  finished?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Start timestamp of the job',
  })
  start_datetime?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Finish timestamp of the job',
  })
  end_datetime?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Title of the job',
  })
  title?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Description of the job',
  })
  description?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @IsArray()
  @ApiProperty({
    description: 'List of the dependencies of the job',
  })
  dependencies?: JobDependency[];

  @IsOptional()
  @ApiProperty({
    description: 'Status of the dependencies',
  })
  dependency_status?: string;

  @IsOptional()
  @IsPositive()
  @ApiProperty({
    description: 'Memory time in MB/s used by the job',
  })
  memory_time_megabyte_seconds?: number;

  @IsOptional()
  @IsPositive()
  @ApiProperty({
    description: 'CPU time in seconds used by the job',
  })
  cpu_time_seconds?: number;

  @IsOptional()
  @ApiProperty({
    description: 'Geometry processed by the job',
  })
  geometry?: any;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsNumber({}, { each: true })
  @ApiProperty({
    description: 'Extend processed by the job',
  })
  bbox?: number[];

  @IsOptional()
  @ValidateNested()
  @ApiProperty({
    description: 'Area processed by the job',
  })
  area?: JobArea;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'Links related to the job',
  })
  links?: string[];

  @IsOptional()
  @ApiProperty({
    description: 'Assets related to the job',
  })
  assets?: any;

  @IsOptional()
  @IsNumber()
  @ApiProperty({
    description: 'EPSG code used while executing the job',
  })
  epsg?: number;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'Instruments used by the job',
  })
  instruments?: string[];

  @IsOptional()
  @ApiProperty({
    description: 'Facility where job is executed',
  })
  processing_facility?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Software version usede by the job',
  })
  processing_software?: string;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'Services that are executed by the job',
  })
  unique_process_ids?: string[];

  @IsOptional()
  @ApiProperty({
    description: 'Usage of different (external) services',
  })
  usage?: any;

  @IsOptional()
  @ApiProperty({
    description: 'User specified options related to the job execution',
  })
  job_options?: any;
}
