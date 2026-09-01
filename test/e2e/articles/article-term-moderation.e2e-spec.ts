import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  AiGenerationStatus,
  TermOrigin,
  TermReviewStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import { configureApp } from '../../../src/app.setup';
import { AdminArticleTermsController } from '../../../src/modules/articles/controllers/admin-article-terms.controller';
import { ArticleTermsService } from '../../../src/modules/articles/services/article-terms.service';
import { JwtAuthGuard } from '../../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../src/modules/auth/guards/roles.guard';

const articleId = '11111111-1111-4111-8111-111111111111';
const termId = '22222222-2222-4222-8222-222222222222';

interface RequestWithTestUser {
  headers: { authorization?: string };
  user?: { id: string; role: UserRole };
}

@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithTestUser>();
    const authorization = request.headers.authorization;
    if (!authorization) throw new UnauthorizedException('Unauthorized');
    request.user = {
      id: authorization.endsWith('admin') ? 'admin-id' : 'user-id',
      role: authorization.endsWith('admin') ? UserRole.ADMIN : UserRole.USER,
    };
    return true;
  }
}

describe('Admin article term moderation API (e2e)', () => {
  let app: INestApplication<App>;
  const termsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    approveAiCandidate: jest.fn(),
    rejectAiCandidate: jest.fn(),
    delete: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminArticleTermsController],
      providers: [
        { provide: ArticleTermsService, useValue: termsService },
        JwtAuthGuard,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderAuthGuard)
      .compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const term = {
      id: termId,
      origin: TermOrigin.AI,
      reviewStatus: TermReviewStatus.PENDING,
      explanationStatus: AiGenerationStatus.PENDING,
    };
    termsService.findAll.mockResolvedValue({
      items: [term],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      contentVersion: 3,
    });
    termsService.approveAiCandidate.mockResolvedValue({
      term: {
        ...term,
        reviewStatus: TermReviewStatus.APPROVED,
        isActive: true,
        isLookupEnabled: true,
      },
      contentHtmlChanged: true,
    });
    termsService.rejectAiCandidate.mockResolvedValue({
      term: {
        ...term,
        reviewStatus: TermReviewStatus.REJECTED,
        isActive: false,
        isLookupEnabled: false,
      },
      contentHtmlChanged: false,
    });
  });

  afterAll(async () => app.close());

  it('requires authenticated ADMIN access for moderation', async () => {
    const url = `/api/v1/admin/articles/${articleId}/terms/${termId}/approve`;
    await request(app.getHttpServer()).post(url).expect(401);
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', 'Bearer user')
      .expect(403);
    expect(termsService.approveAiCandidate).not.toHaveBeenCalled();
  });

  it('publishes the moderation routes, filters, and response fields in Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Term moderation test').build(),
    );
    const listPath = document.paths['/api/v1/admin/articles/{articleId}/terms'];
    const approvePath =
      document.paths[
        '/api/v1/admin/articles/{articleId}/terms/{termId}/approve'
      ];
    const rejectPath =
      document.paths[
        '/api/v1/admin/articles/{articleId}/terms/{termId}/reject'
      ];

    expect(approvePath?.post?.operationId).toBe('postAdminArticleTermApprove');
    expect(rejectPath?.post?.operationId).toBe('postAdminArticleTermReject');
    const listParameters = JSON.stringify(listPath?.get?.parameters);
    expect(listParameters).toContain('origin');
    expect(listParameters).toContain('reviewStatus');
    expect(listParameters).toContain('explanationStatus');

    const termSchema = JSON.stringify(
      document.components?.schemas?.ArticleSentenceTermDto,
    );
    expect(termSchema).not.toContain('selectionReason');
    expect(termSchema).toContain('reviewStatus');
    expect(termSchema).toContain('explanationStatus');
  });

  it('passes allowlisted moderation filters and returns moderation fields', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}/terms`)
      .query({
        page: 1,
        limit: 20,
        origin: TermOrigin.AI,
        reviewStatus: TermReviewStatus.PENDING,
        explanationStatus: AiGenerationStatus.PENDING,
      })
      .set('Authorization', 'Bearer admin')
      .expect(200);

    expect(termsService.findAll).toHaveBeenCalledWith(
      articleId,
      expect.objectContaining({
        origin: TermOrigin.AI,
        reviewStatus: TermReviewStatus.PENDING,
        explanationStatus: AiGenerationStatus.PENDING,
      }),
    );
    const body = response.body as {
      data: { items: Array<Record<string, unknown>> };
    };
    expect(body.data.items[0]).toMatchObject({
      origin: TermOrigin.AI,
      reviewStatus: TermReviewStatus.PENDING,
      explanationStatus: AiGenerationStatus.PENDING,
    });
  });

  it.each([
    {
      action: 'approve',
      method: 'approveAiCandidate',
      contentHtmlChanged: true,
      reviewStatus: TermReviewStatus.APPROVED,
    },
    {
      action: 'reject',
      method: 'rejectAiCandidate',
      contentHtmlChanged: false,
      reviewStatus: TermReviewStatus.REJECTED,
    },
  ] as const)(
    'routes $action without a request body',
    async ({ action, method, contentHtmlChanged, reviewStatus }) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/articles/${articleId}/terms/${termId}/${action}`)
        .set('Authorization', 'Bearer admin')
        .expect(200);

      expect(termsService[method]).toHaveBeenCalledWith(
        'admin-id',
        articleId,
        termId,
      );
      const body = response.body as {
        data: {
          term: { reviewStatus: TermReviewStatus };
          contentHtmlChanged: boolean;
        };
      };
      expect(body.data).toMatchObject({
        term: { reviewStatus },
        contentHtmlChanged,
      });
    },
  );

  it('rejects non-allowlisted moderation filter values before the service', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}/terms`)
      .query({
        page: 1,
        limit: 20,
        origin: 'MODEL',
        reviewStatus: 'WAITING',
      })
      .set('Authorization', 'Bearer admin')
      .expect(400);
    expect(termsService.findAll).not.toHaveBeenCalled();
  });
});
