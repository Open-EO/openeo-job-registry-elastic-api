import { IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Job } from './job.dto';

export class Pagination {
  @IsArray()
  @ApiProperty({
    description: 'List of job results or job ids',
  })
  jobs: Job[] | string[];

  @ApiProperty({
    description: 'Information on the pagination of the results',
  })
  pagination: PaginationDetails;
}

export class PaginationDetails {
  @ApiProperty({
    description: 'URL parameters to use to fetch the previous page',
  })
  previous?: PageDetails;
  @ApiProperty({
    description: 'URL parameters to use to fetch the next page',
  })
  next?: PageDetails;
}

export class PageDetails {
  @ApiProperty({
    description: 'Size to be requested for the next page',
  })
  size: number;
  @ApiProperty({
    description: 'Number of the page to request',
  })
  page: number;
}
