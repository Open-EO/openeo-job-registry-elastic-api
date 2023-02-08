import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigModule } from '../../../config/config.module';
import { ConfigService } from '../../../config/config/config.service';

describe('DatabaseService', () => {
  let service: DatabaseService;

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
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
