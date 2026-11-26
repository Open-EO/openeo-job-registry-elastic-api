import { Test } from '@nestjs/testing';
import { Collection, Db } from 'mongodb';
import { ConfigService } from '../../../config/config/config.service';
import { DocumentdbJobStore } from './documentdb-job-store';

describe('DocumentDB health check', () => {
  let store: DocumentdbJobStore;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DocumentdbJobStore,
        {
          provide: ConfigService,
          useValue: {
            getDocumentdb: (key: string) =>
              ({
                url: 'mongodb://localhost:27017',
                database: 'jobs',
                collection: 'registry',
                tls: false,
              }[key]),
          },
        },
      ],
    }).compile();
    store = module.get(DocumentdbJobStore);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await store.onModuleDestroy();
  });

  it('uses only a collection read, including for an empty collection', async () => {
    const read = jest
      .spyOn(Collection.prototype, 'findOne')
      .mockResolvedValue(null);
    const list = jest.spyOn(Db.prototype, 'listCollections');
    await expect(store.checkHealth()).resolves.toEqual({
      name: 'documentdb',
      status: 'up',
    });
    expect(read).toHaveBeenCalledWith({}, { projection: { _id: 1 } });
    expect(list).not.toHaveBeenCalled();
  });

  it('reports read failures as down', async () => {
    jest
      .spyOn(Collection.prototype, 'findOne')
      .mockRejectedValue(new Error('read forbidden'));
    await expect(store.checkHealth()).resolves.toEqual({
      name: 'documentdb',
      status: 'down',
    });
  });
});
