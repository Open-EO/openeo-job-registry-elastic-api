import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config/config.service';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { version } from '../package.json';
import * as passport from 'passport';
import * as session from 'express-session';

const setupDocs = (app) => {
  const config = new DocumentBuilder()
    .setTitle('OpenEO Job Tracker API')
    .setDescription(
      'API endpoint for tracking jobs that are executed within OpenEO',
    )
    .setVersion(version)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
};

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule);
  const configService: ConfigService = app.get(ConfigService);
  setupDocs(app);
  await app.listen(configService.get('general.port'));
};

bootstrap();
