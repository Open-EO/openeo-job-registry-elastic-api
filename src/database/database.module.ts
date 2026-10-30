import { Module } from '@nestjs/common';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ClientOptions } from '@elastic/elasticsearch';
import { readFileSync } from 'fs';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config/config.service';

export function buildDatabaseOptions(config: ConfigService): ClientOptions {
  const nodes: string[] = config
    .get('database.hosts')
    .split(',')
    .map((host: string) => host.trim());
  const apiKey: string = config.get('database.apiKey');
  if (apiKey) {
    for (const node of nodes) {
      let url: URL;
      try {
        url = new URL(node);
      } catch {
        throw new Error('DB_HOSTS contains an invalid URL');
      }
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error(
          'DB_API_KEY requires HTTPS hosts without URL credentials',
        );
      }
    }
  }
  const caFile: string = config.get('database.caFile');
  return {
    nodes,
    ...(apiKey ? { auth: { apiKey } } : {}),
    ...(caFile
      ? { ssl: { ca: readFileSync(caFile), rejectUnauthorized: true } }
      : {}),
  };
}

@Module({
  imports: [
    ElasticsearchModule.registerAsync({
      imports: [ConfigModule],
      useFactory: buildDatabaseOptions,
      inject: [ConfigService],
    }),
  ],
  exports: [ElasticsearchModule],
})
export class DatabaseModule {}
