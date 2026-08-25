import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CategoriesModule } from '../categories/categories.module';
import { AdminArticleSentencesController } from './controllers/admin-article-sentences.controller';
import { AdminArticleTermsController } from './controllers/admin-article-terms.controller';
import { AdminArticlesController } from './controllers/admin-articles.controller';
import { ArticlesController } from './controllers/articles.controller';
import { ArticlesRepository } from './repositories/articles.repository';
import { ArticleAnalysisRepository } from './repositories/article-analysis.repository';
import { ArticleSentencesRepository } from './repositories/article-sentences.repository';
import { ArticleTermsRepository } from './repositories/article-terms.repository';
import { ArticleContentService } from './services/article-content.service';
import { ArticleAnalysisService } from './services/article-analysis.service';
import { ArticlePublicationService } from './services/article-publication.service';
import { ArticleSentencesService } from './services/article-sentences.service';
import { ArticleTermsService } from './services/article-terms.service';
import { ArticlesService } from './services/articles.service';
import { ArticlePublicationValidator } from './validators/article-publication.validator';

@Module({
  imports: [CategoriesModule],
  controllers: [
    ArticlesController,
    AdminArticlesController,
    AdminArticleSentencesController,
    AdminArticleTermsController,
  ],
  providers: [
    ArticlesRepository,
    ArticleAnalysisRepository,
    ArticleSentencesRepository,
    ArticleTermsRepository,
    ArticlesService,
    ArticleAnalysisService,
    ArticleContentService,
    ArticleSentencesService,
    ArticleTermsService,
    ArticlePublicationValidator,
    ArticlePublicationService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [ArticleContentService, ArticlesService, ArticleSentencesService],
})
export class ArticlesModule {}
