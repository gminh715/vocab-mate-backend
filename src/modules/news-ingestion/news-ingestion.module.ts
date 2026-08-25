import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ArticlesModule } from '../articles/articles.module';
import { CategoriesModule } from '../categories/categories.module';
import { AdminNewsController } from './controllers/admin-news.controller';
import { GuardianClient } from './guardian.client';
import { NEWS_FETCH, type NewsFetch } from './news-http.tokens';
import { NewsContentService } from './services/news-content.service';
import { NewsIngestionService } from './services/news-ingestion.service';

@Module({
  imports: [ArticlesModule, CategoriesModule],
  controllers: [AdminNewsController],
  providers: [
    {
      provide: NEWS_FETCH,
      useFactory: (): NewsFetch => globalThis.fetch.bind(globalThis),
    },
    GuardianClient,
    NewsContentService,
    NewsIngestionService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class NewsIngestionModule {}
