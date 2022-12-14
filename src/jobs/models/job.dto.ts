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

export class Job {
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

  @IsOptional()
  @ApiProperty({
    description: 'ID of the user who executed the job',
    required: false,
  })
  user_id?: string;

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
    description: 'Processing graph used by the job',
    required: false,
  })
  specification?: any;

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
  @IsDateString()
  @ApiProperty({
    description: 'Start timestamp of the job',
    required: false,
  })
  start_datetime?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Finish timestamp of the job',
    required: false,
  })
  end_datetime?: string;

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
  @ApiProperty({
    description: 'Geometry processed by the job',
    required: false,
  })
  geometry?: any;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsNumber({}, { each: true })
  @ApiProperty({
    description: 'Extend processed by the job',
    required: false,
  })
  bbox?: number[];

  @IsOptional()
  @ValidateNested()
  @ApiProperty({
    description: 'Area processed by the job',
    required: false,
  })
  area?: JobArea;

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
  @IsNumber()
  @ApiProperty({
    description: 'EPSG code used while executing the job',
    required: false,
  })
  epsg?: number;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'Instruments used by the job',
    required: false,
  })
  instruments?: string[];

  @IsOptional()
  @ApiProperty({
    description: 'Facility where job is executed',
    required: false,
  })
  processing_facility?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Software version usede by the job',
    required: false,
  })
  processing_software?: string;

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
    description: 'User specified options related to the job execution',
    required: false,
  })
  job_options?: any;
}
