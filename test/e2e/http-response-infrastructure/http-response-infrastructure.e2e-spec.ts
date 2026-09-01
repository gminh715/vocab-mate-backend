import { Controller, Get, INestApplication, Query } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp, setupSwagger } from '../../../src/app.setup';

class ProbeQueryDto {
  @Type(() => Number)
  @IsInt()
  count!: number;
}

@Controller('response-infrastructure')
class ResponseInfrastructureController {
  @Get('success')
  success() {
    return { message: 'ok' };
  }

  @Get('validation')
  validation(@Query() query: ProbeQueryDto) {
    return { message: 'valid', count: query.count };
  }

  @Get('unexpected-error')
  unexpectedError(): never {
    throw new Error('sensitive implementation detail');
  }
}

describe('Global HTTP response infrastructure (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ResponseInfrastructureController],
    }).compile();

    app = moduleFixture.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('wraps successful API responses once in the standard envelope', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/response-infrastructure/success')
      .expect(200)
      .expect({ success: true, data: { message: 'ok' } });
  });

  it('normalizes validation errors into the standard error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/response-infrastructure/validation?count=invalid')
      .expect(400);

    const body = JSON.parse(response.text) as unknown;

    expect(body).toMatchObject({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Validation failed',
      },
    });
    expect(JSON.stringify(body)).toContain('"details":');
  });

  it('sanitizes unexpected errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/response-infrastructure/unexpected-error')
      .expect(500);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'sensitive implementation detail',
    );
  });

  it('leaves Swagger output outside the API response envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    expect(response.body).toHaveProperty('openapi');
    expect(response.body).not.toHaveProperty('success');
  });
});
