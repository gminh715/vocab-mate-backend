import { Module } from '@nestjs/common';
import { AdminArticleSentencesController } from './controllers/admin-article-sentences.controller';
import { AdminArticleTermsController } from './controllers/admin-article-terms.controller';
import { AdminArticlesController } from './controllers/admin-articles.controller';
import { ArticlesController } from './controllers/articles.controller';
import { ArticlesRepository } from './repositories/articles.repository';
import { ArticleContentService } from './services/article-content.service';
import { ArticlePublicationService } from './services/article-publication.service';
import { ArticleSentencesService } from './services/article-sentences.service';
import { ArticleTermsService } from './services/article-terms.service';
import { ArticlesService } from './services/articles.service';

@Module({
  controllers: [
    ArticlesController,
    AdminArticlesController,
    AdminArticleSentencesController,
    AdminArticleTermsController,
  ],
  providers: [
    ArticlesRepository,
    ArticlesService,
    ArticleContentService,
    ArticleSentencesService,
    ArticleTermsService,
    ArticlePublicationService,
  ],
})
export class ArticlesModule {}
