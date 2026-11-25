import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from './config.service';

jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfigService],
    }).compile();
    service = module.get<ConfigService>(ConfigService);
  });

  describe('job store configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.JOB_STORE_TYPE;
      delete process.env.DOCUMENTDB_URL;
      delete process.env.DOCUMENTDB_DATABASE;
      delete process.env.DOCUMENTDB_COLLECTION;
      delete process.env.DOCUMENTDB_TLS;
      delete process.env.DB_HOSTS;
      delete process.env.DB_JOBS_IDX;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('defaults to Elasticsearch without loading DocumentDB settings', () => {
      process.env.DOCUMENTDB_TLS = 'not-a-boolean';
      const config = new ConfigService();
      expect(config.get('database.jobStore.type')).toBe('elasticsearch');
      expect(() => config.get('database.jobStore.documentdb')).toThrow();
      expect(config.getElasticsearch('hosts')).toBe(
        'http://localhost:9200,http://localhost:9201',
      );
      expect(config.getElasticsearch('jobsIdx')).toBe('openeo-jobs-dev');
      expect(config.getElasticsearchHosts()).toEqual([
        'http://localhost:9200',
        'http://localhost:9201',
      ]);
      expect(() => config.get('database.legacyElasticsearch')).toThrow();
      expect(() => config.getDocumentdb('url')).toThrow();
    });

    it('trims whitespace around Elasticsearch hosts', () => {
      process.env.DB_HOSTS = ' http://first:9200, http://second:9200 ';
      expect(new ConfigService().getElasticsearchHosts()).toEqual([
        'http://first:9200',
        'http://second:9200',
      ]);
    });

    it.each(['unknown', 'postgresql'])(
      'rejects unsupported job store type %s',
      (type) => {
        process.env.JOB_STORE_TYPE = type;
        expect(() => new ConfigService()).toThrow();
      },
    );

    it('validates DocumentDB settings only when selected', () => {
      process.env.DOCUMENTDB_TLS = 'not-a-boolean';
      expect(() => new ConfigService()).not.toThrow();
      process.env.JOB_STORE_TYPE = 'documentdb';
      process.env.DOCUMENTDB_TLS = 'true';
      expect(() => new ConfigService()).toThrow('DOCUMENTDB_URL is required');
      process.env.DOCUMENTDB_URL = 'mongodb://localhost:27017';
      expect(() => new ConfigService()).toThrow(
        'DOCUMENTDB_DATABASE is required',
      );
      process.env.DOCUMENTDB_DATABASE = 'jobs';
      const config = new ConfigService();
      expect(config.getDocumentdb('database')).toBe('jobs');
      expect(config.getDocumentdb('collection')).toBe('job_registry_v2');
      expect(config.getDocumentdb('tls')).toBe(true);
      expect(() => config.get('database.jobStore.elasticsearch')).toThrow();
      expect(() => config.getElasticsearch('hosts')).toThrow();
      expect(() => config.getElasticsearchHosts()).toThrow();
    });

    it.each([
      ['not-a-url', 'valid MongoDB connection string'],
      [
        'mongodb://localhost/?tlsInsecure=true',
        'cannot disable TLS verification',
      ],
      [
        'mongodb://localhost/?tlsAllowInvalidCertificates=true',
        'cannot disable TLS verification',
      ],
    ])('rejects unsafe or invalid DocumentDB URL', (url, message) => {
      process.env.JOB_STORE_TYPE = 'documentdb';
      process.env.DOCUMENTDB_DATABASE = 'jobs';
      process.env.DOCUMENTDB_URL = url;
      expect(() => new ConfigService()).toThrow(message);
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('fails startup when Entra trust or caller configuration is missing', () => {
    const previous = process.env;
    process.env = { ...previous, AUTH_TYPE: 'entra' };
    try {
      expect(() => new ConfigService()).toThrow('ENTRA_ISSUER');
      process.env.ENTRA_ISSUER =
        'https://login.microsoftonline.com/8f0cef0d-4bae-4451-bc81-9b45fc92d79d/v2.0';
      expect(() => new ConfigService()).toThrow('audience');
      process.env.ENTRA_AUDIENCE = 'api-audience';
      expect(() => new ConfigService()).toThrow('clientIds');
      process.env.ENTRA_CLIENT_IDS = 'caller-id';
      expect(new ConfigService().get('auth.type')).toBe('entra');
      process.env.ENTRA_ROLES = ', ,';
      expect(() => new ConfigService()).toThrow('roles');
    } finally {
      process.env = previous;
    }
  });
});
