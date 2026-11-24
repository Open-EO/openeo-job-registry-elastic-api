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
      delete process.env.POSTGRES_URL;
      delete process.env.POSTGRES_SSL;
      delete process.env.POSTGRES_CA_FILE;
      delete process.env.DB_HOSTS;
      delete process.env.DB_JOBS_IDX;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('defaults to Elasticsearch without loading PostgreSQL settings', () => {
      process.env.POSTGRES_SSL = 'not-a-boolean';
      const config = new ConfigService();
      expect(config.get('database.jobStore.type')).toBe('elasticsearch');
      expect(() => config.get('database.jobStore.postgresql')).toThrow();
      expect(config.get('database.jobStore.elasticsearch.hosts')).toBe(
        'http://localhost:9200,http://localhost:9201',
      );
      expect(config.get('database.jobStore.elasticsearch.jobsIdx')).toBe(
        'openeo-jobs-dev',
      );
      expect(() => config.get('database.legacyElasticsearch')).toThrow();
      expect(config.getElasticsearch('hosts')).toBe(
        'http://localhost:9200,http://localhost:9201',
      );
      expect(config.getElasticsearch('jobsIdx')).toBe('openeo-jobs-dev');
      expect(config.getElasticsearchHosts()).toEqual([
        'http://localhost:9200',
        'http://localhost:9201',
      ]);
      expect(() => config.getPostgresql('url')).toThrow();
    });

    it('loads PostgreSQL settings only when selected', () => {
      process.env.JOB_STORE_TYPE = 'postgresql';
      process.env.POSTGRES_URL = 'postgresql://localhost/jobs';
      process.env.POSTGRES_SSL = 'false';
      process.env.POSTGRES_CA_FILE = '';
      process.env.DB_HOSTS = 'http://elastic.example:9200';
      process.env.DB_JOBS_IDX = 'legacy-jobs';
      const config = new ConfigService();
      expect(config.get('database.jobStore.type')).toBe('postgresql');
      expect(config.getPostgresql('url')).toBe('postgresql://localhost/jobs');
      expect(config.getPostgresql('ssl')).toBe(false);
      expect(config.getPostgresql('caFile')).toBe('');
      expect(() => config.get('database.jobStore.elasticsearch')).toThrow();
      expect(() => config.get('database.legacyElasticsearch')).toThrow();
      expect(() => config.getElasticsearch('hosts')).toThrow();
      expect(() => config.getElasticsearchHosts()).toThrow();
    });

    it('trims whitespace around Elasticsearch hosts', () => {
      process.env.DB_HOSTS = ' http://first:9200, http://second:9200 ';
      expect(new ConfigService().getElasticsearchHosts()).toEqual([
        'http://first:9200',
        'http://second:9200',
      ]);
    });

    it('rejects unknown job store types', () => {
      process.env.JOB_STORE_TYPE = 'unknown';
      expect(() => new ConfigService()).toThrow();
    });

    it('validates PostgreSQL settings only when selected', () => {
      process.env.POSTGRES_URL = '';
      expect(() => new ConfigService()).not.toThrow();

      process.env.JOB_STORE_TYPE = 'postgresql';
      expect(() => new ConfigService()).toThrow(
        'POSTGRES_URL is required for the PostgreSQL job store',
      );
    });

    it.each([
      ['not-a-url', 'POSTGRES_URL must be a valid PostgreSQL URL'],
      ['https://localhost/jobs', 'POSTGRES_URL must be a valid PostgreSQL URL'],
      [
        'postgresql://localhost/jobs?sslmode=require',
        'Configure PostgreSQL TLS with POSTGRES_SSL and POSTGRES_CA_FILE, not URL parameters',
      ],
      [
        'postgresql://localhost/jobs?sslrootcert=/tmp/ca.pem',
        'Configure PostgreSQL TLS with POSTGRES_SSL and POSTGRES_CA_FILE, not URL parameters',
      ],
    ])('rejects invalid PostgreSQL URL %s', (url, message) => {
      process.env.JOB_STORE_TYPE = 'postgresql';
      process.env.POSTGRES_URL = url;
      expect(() => new ConfigService()).toThrow(message);
    });

    it('requires SSL when a PostgreSQL CA file is configured', () => {
      process.env.JOB_STORE_TYPE = 'postgresql';
      process.env.POSTGRES_URL = 'postgresql://localhost/jobs';
      process.env.POSTGRES_SSL = 'false';
      process.env.POSTGRES_CA_FILE = '/tmp/ca.pem';
      expect(() => new ConfigService()).toThrow(
        'POSTGRES_CA_FILE requires POSTGRES_SSL',
      );
    });

    it('rejects malformed percent-encoding in PostgreSQL URL credentials', () => {
      process.env.JOB_STORE_TYPE = 'postgresql';
      process.env.POSTGRES_URL = 'postgresql://user%ZZ:password@localhost/jobs';
      expect(() => new ConfigService()).toThrow(
        'POSTGRES_URL must have valid percent-encoding in credentials',
      );
    });

    it('accepts a valid PostgreSQL URL when selected', () => {
      process.env.JOB_STORE_TYPE = 'postgresql';
      process.env.POSTGRES_URL = 'postgresql://localhost/jobs';
      expect(() => new ConfigService()).not.toThrow();
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
