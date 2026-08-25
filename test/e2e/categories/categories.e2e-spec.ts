import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { configureApp, setupSwagger } from '../../../src/app.setup';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  CategoriesRepository,
  PublicCategoryRecord,
} from '../../../src/modules/categories/repositories/categories.repository';
import { InMemoryCategoriesRepository } from '../../support/in-memory-categories.repository';

interface SuccessBody<T> {
  success: true;
  data: T;
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: string[] };
}

const responseBody = <T>(response: { text: string }): T =>
  JSON.parse(response.text) as T;

describe('Categories APIs (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(CategoriesRepository)
      .useValue(new InMemoryCategoriesRepository())
      .compile();

    app = moduleFixture.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('publishes both public category operations and their response contracts', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            parameters: Array<{ name: string }>;
            responses: Record<string, object>;
            security?: Array<Record<string, string[]>>;
          }
        >
      >;
    }>(response);
    const list = swagger.paths['/api/v1/categories'].get;
    const detail = swagger.paths['/api/v1/categories/{slug}'].get;

    expect(list.operationId).toBe('getCategories');
    expect(list.parameters.map(({ name }) => name)).toEqual(['q', 'sort']);
    expect(Object.keys(list.responses)).toEqual(
      expect.arrayContaining(['200', '400', '500']),
    );
    expect(detail.operationId).toBe('getCategoriesBySlug');
    expect(detail.parameters.map(({ name }) => name)).toContain('slug');
    expect(Object.keys(detail.responses)).toEqual(
      expect.arrayContaining(['200', '400', '404', '500']),
    );
    expect(list.security).toBeUndefined();
    expect(detail.security).toBeUndefined();
  });

  it('CAT-001 is public and returns only active safe fields in stable order', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .expect(200);
    const body =
      responseBody<SuccessBody<{ items: PublicCategoryRecord[] }>>(response);

    expect(body.success).toBe(true);
    expect(body.data.items.map(({ id }) => id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444444',
    ]);
    expect(JSON.stringify(body)).not.toContain('Hidden Technology');
    expect(JSON.stringify(body)).not.toContain('isActive');
    expect(JSON.stringify(body)).not.toContain('displayOrder');
  });

  it('CAT-001 filters by normalized category name at repository level', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/categories?q=%20technology%20')
      .expect(200);
    const body =
      responseBody<SuccessBody<{ items: PublicCategoryRecord[] }>>(response);

    expect(body.data.items).toEqual([
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Technology',
        slug: 'technology',
      },
    ]);
  });

  it.each(['/api/v1/categories?q=%20%20', '/api/v1/categories?sort=name'])(
    'CAT-001 rejects invalid query %s with the standard envelope',
    async (url) => {
      const response = await request(app.getHttpServer()).get(url).expect(400);
      const body = responseBody<ErrorBody>(response);

      expect(body).toMatchObject({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Validation failed' },
      });
    },
  );

  it('CAT-002 is public, normalizes the slug, and returns the standard envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/categories/TECHNOLOGY')
      .expect(200);

    expect(
      responseBody<SuccessBody<{ category: PublicCategoryRecord }>>(response),
    ).toEqual({
      success: true,
      data: {
        category: {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Technology',
          slug: 'technology',
        },
      },
    });
  });

  it.each(['missing', 'hidden-technology'])(
    'CAT-002 returns the same 404 envelope for %s',
    async (slug) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/categories/${slug}`)
        .expect(404);
      const body = responseBody<ErrorBody>(response);

      expect(body).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Category not found' },
      });
    },
  );
});
