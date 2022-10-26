import { ApiProperty } from '@nestjs/swagger';

export class JobArea {
  @ApiProperty({
    description: 'Value of the area processed',
  })
  value: number;

  @ApiProperty({
    description: 'Unit of the area processed',
  })
  unit: string;
}

export class JobDependency {
  @ApiProperty({
    description: 'ID of the collection',
  })
  collection_id: string;

  @ApiProperty({
    description: 'Batch request IDs',
  })
  batch_request_ids: string[];

  @ApiProperty({
    description: 'URL where the results are stored',
  })
  results_location: string;

  @ApiProperty({
    description: 'Card4L flag',
  })
  card4l: boolean;
}

export class Job {
  @ApiProperty({
    description: 'ID of the job',
  })
  job_id: string;

  @ApiProperty({
    description: 'ID of the parent job',
  })
  parent_id: string;

  @ApiProperty({
    description: 'ID of the user who executed the job',
  })
  user_id: string;

  @ApiProperty({
    description: 'Proxy user used to execute the job',
  })
  proxy_user: string;

  @ApiProperty({
    description: 'Status of the job',
  })
  status: string;

  @ApiProperty({
    description: 'Version of the openEO API',
  })
  api_version: string;

  @ApiProperty({
    description: 'Processing graph used by the job',
  })
  specification: any;

  @ApiProperty({
    description: 'ID of the application linked to the job',
  })
  application_id: string;

  @ApiProperty({
    description: 'Creation timestamp of the job',
  })
  created: string;

  @ApiProperty({
    description: 'Last update timestamp of the job',
  })
  updated: string;

  @ApiProperty({
    description: 'Start timestamp of the job',
  })
  started: string;

  @ApiProperty({
    description: 'Finish timestamp of the job',
  })
  finished: string;

  @ApiProperty({
    description: 'Start timestamp of the job',
  })
  start_datetime: string;

  @ApiProperty({
    description: 'Finish timestamp of the job',
  })
  end_datetime: string;

  @ApiProperty({
    description: 'Title of the job',
  })
  title: string;

  @ApiProperty({
    description: 'Description of the job',
  })
  description: string;

  @ApiProperty({
    description: 'List of the dependencies of the job',
  })
  dependencies: JobDependency[];

  @ApiProperty({
    description: 'Status of the dependencies',
  })
  dependency_status: string;

  @ApiProperty({
    description: 'Memory time in MB/s used by the job',
  })
  memory_time_megabyte_seconds: number;

  @ApiProperty({
    description: 'CPU time in seconds used by the job',
  })
  cpu_time_seconds: number;

  @ApiProperty({
    description: 'Geometry processed by the job',
  })
  geometry: number;

  @ApiProperty({
    description: 'Extend processed by the job',
  })
  bbox: number[];

  @ApiProperty({
    description: 'Area processed by the job',
  })
  area: JobArea;

  @ApiProperty({
    description: 'Links related to the job',
  })
  links: string[];

  @ApiProperty({
    description: 'Assets related to the job',
  })
  assets: any;

  @ApiProperty({
    description: 'EPSG code used while executing the job',
  })
  epsg: number;

  @ApiProperty({
    description: 'Instruments used by the job',
  })
  instruments: string[];

  @ApiProperty({
    description: 'Facility where job is executed',
  })
  processing_facility: string;

  @ApiProperty({
    description: 'Software version usede by the job',
  })
  processing_software: string;

  @ApiProperty({
    description: 'Services that are executed by the job',
  })
  unique_process_ids: string[];

  @ApiProperty({
    description: 'Usage of different (external) services',
  })
  usage: any;
  @ApiProperty({
    description: 'User specified options related to the job execution',
  })
  job_options: any;
}
