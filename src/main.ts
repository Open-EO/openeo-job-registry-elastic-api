import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config/config.service';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { version } from '../package.json';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

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
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));
  app.useLogger(
    configService.get('general.debug')
      ? ['log', 'error', 'warn', 'debug', 'verbose']
      : ['error', 'warn'],
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(configService.get('general.port'));
};

bootstrap();
