import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ReviewGoal, UserRole } from '../../../generated/prisma/enums';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { configureApp, setupSwagger } from '../../../src/app.setup';
import { PrismaService } from '../../../src/database/prisma.service';
import { AuthService } from '../../../src/modules/auth/services/auth.service';
import type { RequestWithUser } from '../../../src/modules/auth/auth.types';
import { JwtAuthGuard } from '../../../src/modules/auth/guards/jwt-auth.guard';
import { NewsIngestionService } from '../../../src/modules/news-ingestion/services/news-ingestion.service';
import { ReadingService } from '../../../src/modules/reading/services/reading.service';
import { ReviewsService } from '../../../src/modules/reviews/services/reviews.service';

const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';
const TERM_ID = '22222222-2222-4222-8222-222222222222';
const REVIEW_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const REVIEW_ITEM_ID = '44444444-4444-4444-8444-444444444444';
const QUESTION_ID = '55555555-5555-4555-8555-555555555555';
const OPTION_ID = '66666666-6666-4666-8666-666666666666';
const CATEGORY_ID = '77777777-7777-4777-8777-777777777777';

interface HttpResponse {
  headers: Record<string, string | undefined>;
  text: string;
}

@Injectable()
class SecurityTestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const target = context.switchToHttp().getRequest<RequestWithUser>();
    if (!target.headers.authorization) {
      throw new UnauthorizedException('Access token is invalid');
    }

    target.user = {
      id: 'security-test-user',
      email: 'security-test@example.com',
      role: UserRole.ADMIN,
      status: 'ACTIVE',
    };
    return true;
  }
}

describe('HTTP security and throttling (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(AuthService)
      .useValue({
        login: jest.fn().mockResolvedValue({
          user: {
            id: 'security-test-user',
            email: 'security-test@example.com',
            role: UserRole.USER,
            status: 'ACTIVE',
          },
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
      })
      .overrideProvider(ReadingService)
      .useValue({
        getHistory: jest.fn().mockResolvedValue({ items: [], meta: {} }),
        getContextualTerm: jest.fn().mockResolvedValue({ term: {} }),
      })
      .overrideProvider(ReviewsService)
      .useValue({
        startSession: jest.fn().mockResolvedValue({ session: {} }),
        submitAnswer: jest.fn().mockResolvedValue({ result: {} }),
      })
      .overrideProvider(NewsIngestionService)
      .useValue({
        search: jest.fn().mockResolvedValue({ articles: [] }),
        sync: jest.fn().mockResolvedValue({ items: [] }),
      })
      .overrideGuard(JwtAuthGuard)
      .useClass(SecurityTestAuthGuard)
      .compile();

    app = module.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('enables standard security headers and keeps Swagger usable with a scoped CSP exception', async () => {
    const apiResponse = (await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)) as unknown as HttpResponse;

    expect(typeof apiResponse.headers['content-security-policy']).toBe(
      'string',
    );
    expect(apiResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(apiResponse.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(typeof apiResponse.headers['referrer-policy']).toBe('string');

    const swaggerResponse = (await request(app.getHttpServer())
      .get('/api/docs')
      .expect(200)) as unknown as HttpResponse;
    expect(swaggerResponse.headers['content-security-policy']).toBeUndefined();
    expect(swaggerResponse.text).toContain('swagger-ui');
  });

  it('keeps the existing auth ceiling at 20 requests per minute', async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'security-test@example.com',
          password: 'StrongPass@123',
        })
        .expect(200);
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'security-test@example.com', password: 'StrongPass@123' })
      .expect(429);
  });

  it('applies stricter ceilings to AI enrichment and review preparation without constraining normal reads to those levels', async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app.getHttpServer())
        .get('/api/v1/reading/history?page=1&limit=20&sort=newest')
        .set('Authorization', 'Bearer test')
        .expect(200);
    }

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await request(app.getHttpServer())
        .get(`/api/v1/reading/articles/${ARTICLE_ID}/terms/${TERM_ID}`)
        .set('Authorization', 'Bearer test')
        .expect(200);
    }

    await request(app.getHttpServer())
      .get(`/api/v1/reading/articles/${ARTICLE_ID}/terms/${TERM_ID}`)
      .set('Authorization', 'Bearer test')
      .expect(429);

    const reviewRequest = {
      reviewGoal: ReviewGoal.RECALL,
    };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/review-sessions')
        .set('Authorization', 'Bearer test')
        .send(reviewRequest)
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/api/v1/review-sessions')
      .set('Authorization', 'Bearer test')
      .send(reviewRequest)
      .expect(429);
  });

  it('throttles Guardian discovery and import independently from ordinary application reads', async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app.getHttpServer())
        .get('/api/v1/admin/news/search')
        .set('Authorization', 'Bearer test')
        .expect(200);
    }

    await request(app.getHttpServer())
      .get('/api/v1/admin/news/search')
      .set('Authorization', 'Bearer test')
      .expect(429);

    const syncRequest = {
      section: 'technology',
      defaultCategoryId: CATEGORY_ID,
    };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/admin/news/sync')
        .set('Authorization', 'Bearer test')
        .send(syncRequest)
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/api/v1/admin/news/sync')
      .set('Authorization', 'Bearer test')
      .send(syncRequest)
      .expect(429);
  });

  it('throttles answer flows that can trigger diagnosis and AI retests', async () => {
    const answerRequest = {
      reviewSessionItemId: REVIEW_ITEM_ID,
      reviewQuestionId: QUESTION_ID,
      selectedOptionId: OPTION_ID,
    };
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app.getHttpServer())
        .post(`/api/v1/review-sessions/${REVIEW_SESSION_ID}/answers`)
        .set('Authorization', 'Bearer test')
        .send(answerRequest)
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${REVIEW_SESSION_ID}/answers`)
      .set('Authorization', 'Bearer test')
      .send(answerRequest)
      .expect(429);
  });
});
