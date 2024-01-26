import { Test, TestingModule } from '@nestjs/testing';
import { JobsController } from './jobs.controller';
import { ConfigModule } from '../../../config/config.module';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigService } from '../../../config/config/config.service';
import { DatabaseService } from '../../services/database/database.service';
import { Logger } from '@nestjs/common';
import { JOB } from '../../mocks/job.mock';

describe('JobsController', () => {
  let controller: JobsController;
  let databaseService: DatabaseService;

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
      controllers: [JobsController],
      providers: [DatabaseService, Logger],
    }).compile();

    controller = module.get<JobsController>(JobsController);
    databaseService = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should store jobs in the database', async () => {
    const db = jest
      .spyOn(databaseService, 'saveJobs')
      .mockResolvedValueOnce(JOB);
    expect(await controller.storeJobs(JOB)).toEqual(JOB);
    expect(db).toBeCalledTimes(1);
  });

  it('should search the jobs based on an give query', async () => {
    const db = jest
      .spyOn(databaseService, 'queryJobs')
      .mockResolvedValueOnce([JOB]);

    expect(await controller.queryJobs({})).toEqual([JOB]);
    expect(db).toBeCalledTimes(1);
  });

  it('should throw an error when something went wrong when querying the database', async () => {
    const db = jest
      .spyOn(databaseService, 'queryJobs')
      .mockImplementationOnce(() => {
        throw new Error('No can do!');
      });
    await expect(controller.queryJobs({})).rejects.toThrowError();
    expect(db).toBeCalledTimes(1);
  });

  it('should patch the job', async () => {
    const dbJob = jest
      .spyOn(databaseService, 'getJobDocId')
      .mockResolvedValueOnce(JOB.job_id);
    const dbPatch = jest
      .spyOn(databaseService, 'patchJob')
      .mockResolvedValueOnce(JOB);

    expect(await controller.patchJob(JOB.job_id, JOB)).toEqual(JOB);
    expect(dbJob).toBeCalledTimes(1);
    expect(dbPatch).toBeCalledTimes(1);
  });

  it('should throw an error when job ID does not exists when patching the job', async () => {
    const dbJob = jest
      .spyOn(databaseService, 'getJobDocId')
      .mockResolvedValueOnce(undefined);
    const dbPatch = jest
      .spyOn(databaseService, 'patchJob')
      .mockResolvedValueOnce(JOB);

    await expect(controller.patchJob(JOB.job_id, JOB)).rejects.toThrowError();
    expect(dbJob).toBeCalledTimes(1);
    expect(dbPatch).toBeCalledTimes(0);
  });

  it('should update the deleted flag of a job when receiving a delete request', async () => {
    const dbJob = jest
      .spyOn(databaseService, 'getJobDocId')
      .mockResolvedValueOnce(JOB.job_id);
    const dbPatch = jest
      .spyOn(databaseService, 'patchJob')
      .mockResolvedValueOnce(JOB);

    await controller.deleteJob(JOB.job_id);

    expect(dbJob).toBeCalledTimes(1);
    expect(dbPatch).toBeCalledTimes(1);
    expect(dbPatch).toBeCalledWith(JOB.job_id, {
      deleted: true,
    });
  });

  it('should throw an error when document does not exists when deleting it', async () => {
    const dbJob = jest
      .spyOn(databaseService, 'getJobDocId')
      .mockResolvedValueOnce(undefined);
    const dbPatch = jest
      .spyOn(databaseService, 'patchJob')
      .mockResolvedValueOnce(JOB);

    await expect(controller.deleteJob(JOB.job_id)).rejects.toThrowError();
    expect(dbJob).toBeCalledTimes(1);
    expect(dbPatch).toBeCalledTimes(0);
  });
});
