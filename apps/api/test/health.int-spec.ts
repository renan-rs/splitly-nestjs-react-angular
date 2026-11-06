import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

async function createApp(customize?: (builder: TestingModuleBuilder) => void) {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  customize?.(builder);
  const app = (await builder.compile()).createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('Health and error handling (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports ok when the database is reachable', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('sets security headers', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns Problem Details for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/api/v1/nope',
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  it('GET /api/v1/health returns 503 Problem Details when the database is down', async () => {
    const downApp = await createApp((builder) =>
      builder
        .overrideProvider(PrismaService)
        .useValue({ $queryRaw: () => Promise.reject(new Error('connection refused')) }),
    );

    const response = await request(downApp.getHttpServer()).get('/api/v1/health').expect(503);
    await downApp.close();

    expect(response.body).toMatchObject({ status: 503, title: 'Service Unavailable' });
    expect(JSON.stringify(response.body)).not.toContain('connection refused');
  });
});
