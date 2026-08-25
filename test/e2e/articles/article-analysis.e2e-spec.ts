import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { UserRole } from '../../../generated/prisma/enums';
import { configureApp } from '../../../src/app.setup';
import { AdminArticlesController } from '../../../src/modules/articles/controllers/admin-articles.controller';
import { ArticleAnalysisService } from '../../../src/modules/articles/services/article-analysis.service';
import { ArticlePublicationService } from '../../../src/modules/articles/services/article-publication.service';
import { ArticleSentencesService } from '../../../src/modules/articles/services/article-sentences.service';
import { ArticlesService } from '../../../src/modules/articles/services/articles.service';
import { JwtAuthGuard } from '../../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../src/modules/auth/guards/roles.guard';

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

describe('Admin article analysis API (e2e)', () => {
  let app: INestApplication<App>;
  const analysisService = { analyze: jest.fn() };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminArticlesController],
      providers: [
        { provide: ArticlesService, useValue: {} },
        { provide: ArticleAnalysisService, useValue: analysisService },
        { provide: ArticleSentencesService, useValue: {} },
        { provide: ArticlePublicationService, useValue: {} },
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

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => app.close());

  it('requires authentication and ADMIN authorization', async () => {
    const url =
      '/api/v1/admin/articles/11111111-1111-4111-8111-111111111111/analyze';

    await request(app.getHttpServer()).post(url).expect(401);
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', 'Bearer user')
      .expect(403);
    expect(analysisService.analyze).not.toHaveBeenCalled();
  });

  it('accepts no body and returns only the safe analysis summary', async () => {
    analysisService.analyze.mockResolvedValue({
      articleId: '11111111-1111-4111-8111-111111111111',
      contentVersion: 2,
      aiAnalysisStatus: 'READY',
      category: {
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'society',
        name: 'Society',
      },
      cefrLevel: 'B1',
      candidateCount: 3,
    });

    const response = await request(app.getHttpServer())
      .post(
        '/api/v1/admin/articles/11111111-1111-4111-8111-111111111111/analyze',
      )
      .set('Authorization', 'Bearer admin')
      .expect(200);

    expect(analysisService.analyze).toHaveBeenCalledWith(
      'admin-id',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(response.body).toEqual({
      success: true,
      data: {
        articleId: '11111111-1111-4111-8111-111111111111',
        contentVersion: 2,
        aiAnalysisStatus: 'READY',
        category: {
          id: '22222222-2222-4222-8222-222222222222',
          slug: 'society',
          name: 'Society',
        },
        cefrLevel: 'B1',
        candidateCount: 3,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('prompt');
    expect(JSON.stringify(response.body)).not.toContain('raw');
  });
});
