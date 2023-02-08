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
      providers: [DatabaseService],
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
    const es = jest.spyOn(esService, 'bulk').mockReturnValueOnce(undefined);
    expect(await service.saveJobs([JOB])).toEqual([JOB]);
    expect(es).toBeCalledTimes(1);
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
      .mockResolvedValue(['foobar_id']);

    const id = await service.getJobDocId('foobar');
    expect(getJobID).toBeCalledTimes(1);
    expect(id).toEqual('foobar_id');
  });

  it('should retry getting the job ID if the request failed', async () => {
    const getJobID = jest.spyOn(service, 'queryJobs').mockResolvedValue([]);

    const id = await service.getJobDocId('foobar');
    expect(getJobID).toBeCalledTimes(5);
    expect(id).toBeUndefined();
  });
});
