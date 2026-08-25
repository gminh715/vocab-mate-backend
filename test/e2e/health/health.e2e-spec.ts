import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../../../src/app.setup';
import { PrismaService } from '../../../src/database/prisma.service';
import { HealthController } from '../../../src/modules/health/controllers/health.controller';
import { HealthService } from '../../../src/modules/health/services/health.service';

describe('Health endpoints (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = {
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    app = moduleFixture.createNestApplication<App>();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => app.close());

  it('returns 200 from /health/live without querying Prisma', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('Database unavailable'));

    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns 200 from /health/ready when Prisma is reachable', async () => {
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({ status: 'ok' });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns 503 from /health/ready when Prisma is unavailable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('Database unavailable'));

    await request(app.getHttpServer()).get('/health/ready').expect(503);
  });
});
