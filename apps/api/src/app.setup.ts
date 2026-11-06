import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Application } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { createValidationPipe } from './common/validation';
import type { Env } from './config/env';
import { ACCESS_COOKIE } from './auth/auth.constants';

export const API_PREFIX = 'api/v1';

/** Shared by main.ts, the OpenAPI export and the integration tests so they run the same pipeline. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  // Rate limiting keys on req.ip, which is the proxy's address unless the proxy is trusted.
  (app.getHttpAdapter().getInstance() as Application).set('trust proxy', config.get('TRUST_PROXY'));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.get('CORS_ORIGINS'), credentials: true });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('Splitly API')
    .setDescription('Group expense splitting API.')
    .setVersion('1.0')
    .addCookieAuth(ACCESS_COOKIE)
    .build();
  return SwaggerModule.createDocument(app, options);
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), { jsonDocumentUrl: 'docs-json' });
}
