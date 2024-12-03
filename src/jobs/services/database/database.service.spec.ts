import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import {
  ElasticsearchModule,
  ElasticsearchService,
} from '@nestjs/elasticsearch';
import { ConfigModule } from '../../../config/config.module';
import { ConfigService } from '../../../config/config/config.service';
import { JOB } from '../../mocks/job.mock';
import { TransportRequestCallback } from '@elastic/elasticsearch/lib/Transport';
import { QUERIES } from '../../mocks/query.mock';
import { Logger } from '@nestjs/common';
import { ResponseError } from '@elastic/elasticsearch/lib/errors';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let esService: ElasticsearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        ElasticsearchModule.registerAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => ({
            nodes: configService
              .get('database.hosts')
              .split(',')
              .map((h) => h.trim()),
          }),
          inject: [ConfigService],
        }),
      ],
      providers: [DatabaseService, Logger],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    esService = module.get<ElasticsearchService>(ElasticsearchService);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should save jobs in bulk', async () => {
    const es = jest.spyOn(esService, 'index').mockReturnValueOnce({
      statusCode: 201,
      body: {
        items: [
          {
            id: 1,
          },
          {
            id: 2,
          },
        ],
      },
    } as any);
    expect(await service.saveJobs(JOB)).toEqual(JOB);
    expect(es).toBeCalledTimes(1);
  });

  it('should throw an error if the bulk request fails', async () => {
    let es = jest.spyOn(esService, 'index').mockReturnValueOnce({
      statusCode: 400,
    } as any);
    await expect(service.saveJobs(JOB)).rejects.toThrowError();

    es = jest.spyOn(esService, 'index').mockImplementationOnce(() => {
      throw Error('No can do!');
    });
    await expect(service.patchJob(JOB.job_id, JOB)).rejects.toThrowError();

    expect(es).toBeCalledTimes(1);
  });

  it('should throw an error if the update job fails', async () => {
    let es = jest.spyOn(esService, 'update').mockReturnValueOnce({
      statusCode: 400,
    } as any);
    await expect(service.patchJob(JOB.job_id, JOB)).rejects.toThrowError();

    es = jest.spyOn(esService, 'update').mockImplementationOnce(() => {
      throw Error('No can do!');
    });
    await expect(service.patchJob(JOB.job_id, JOB)).rejects.toThrowError();

    expect(es).toBeCalledTimes(2);
  });

  it('should patch the job and retrieve the updated result', async () => {
    const esUpdate = jest
      .spyOn(esService, 'update')
      .mockReturnValueOnce(undefined);
    const esGet = jest.spyOn(esService, 'get').mockReturnValueOnce({
      body: {
        _source: JOB,
      },
      abort: undefined,
    } as TransportRequestCallback);

    expect(await service.patchJob('foobar', JOB)).toEqual(JOB);
    expect(esUpdate).toBeCalledTimes(1);
    expect(esGet).toBeCalledTimes(1);
  });

  it('should not retry getting the job ID if the request returned an ID', async () => {
    const getJobID = jest
      .spyOn(service, 'queryJobs')
      .mockResolvedValue({ jobs: ['foobar_id'], pagination: {} });

    const id = await service.getJobDocId('foobar');
    expect(getJobID).toBeCalledTimes(1);
    expect(id).toEqual('foobar_id');
  });

  it('should retry getting the job ID if the request failed', async () => {
    const getJobID = jest
      .spyOn(service, 'executeJobQuery')
      .mockResolvedValue({ jobs: [], pagination: {} });

    const id = await service.getJobDocId('foobar');
    expect(getJobID).toBeCalledTimes(5);
    expect(id).toBeUndefined();
  });

  it('should add the deleted filter by default when querying jobs', async () => {
    jest.spyOn(esService, 'search').mockReturnValue({
      body: {
        hits: {
          hits: [],
          total: {
            value: 0,
          },
        },
      },
    } as any);
    const deletedFilter = jest
      .spyOn(service, 'addDeletedFilter')
      .mockReturnValueOnce(QUERIES[1].input);

    await service.queryJobs(QUERIES[1].input);
    expect(deletedFilter).toBeCalledTimes(5);
  });

  it('should not add the deleted filter when querying jobs and deleted flag is set to true', async () => {
    jest.spyOn(esService, 'search').mockReturnValue({
      body: {
        hits: {
          hits: [],
          total: {
            value: 0,
          },
        },
      },
    } as any);
    const deletedFilter = jest
      .spyOn(service, 'addDeletedFilter')
      .mockReturnValueOnce(QUERIES[1].input);

    await service.queryJobs(QUERIES[1].input, 0, 1, true);
    expect(deletedFilter).toBeCalledTimes(0);
  });
  it('should correctly update the query to filter out deleted documents', async () => {
    let count = 1;
    for (const query of QUERIES) {
      console.log(`Testing query ${count}`);
      expect(service.addDeletedFilter(query.input)).toEqual(query.output);
      count++;
    }
  });
});
