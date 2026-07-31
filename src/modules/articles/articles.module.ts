import { Module } from '@nestjs/common';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../common/interceptors/success-response.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CategoriesModule } from '../categories/categories.module';
import { AiModule } from '../ai/ai.module';
import { AdminArticleSentencesController } from './controllers/admin-article-sentences.controller';
import { AdminArticleTermsController } from './controllers/admin-article-terms.controller';
import { AdminArticlesController } from './controllers/admin-articles.controller';
import { ArticlesController } from './controllers/articles.controller';
import { ArticlesRepository } from './repositories/articles.repository';
import { ArticleContentService } from './services/article-content.service';
import { ArticleAnalysisService } from './services/article-analysis.service';
import { ArticlePublicationService } from './services/article-publication.service';
import { ArticleSentencesService } from './services/article-sentences.service';
import { ArticleTermsService } from './services/article-terms.service';
import { ArticlesService } from './services/articles.service';

@Module({
  imports: [AiModule, CategoriesModule],
  controllers: [
    ArticlesController,
    AdminArticlesController,
    AdminArticleSentencesController,
    AdminArticleTermsController,
  ],
  providers: [
    ArticlesRepository,
    ArticlesService,
    ArticleAnalysisService,
    ArticleContentService,
    ArticleSentencesService,
    ArticleTermsService,
    ArticlePublicationService,
    SuccessResponseInterceptor,
    ApiExceptionFilter,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [ArticleContentService, ArticlesService, ArticleSentencesService],
})
export class ArticlesModule {}
