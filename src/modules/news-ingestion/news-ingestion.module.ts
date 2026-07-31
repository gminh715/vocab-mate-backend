import { Module } from '@nestjs/common';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../common/interceptors/success-response.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ArticlesModule } from '../articles/articles.module';
import { AdminNewsController } from './admin-news.controller';
import { GuardianClient } from './guardian.client';
import { NEWS_FETCH, type NewsFetch } from './news-http.tokens';
import { NewsContentService } from './news-content.service';
import { NewsIngestionService } from './news-ingestion.service';

@Module({
  imports: [ArticlesModule],
  controllers: [AdminNewsController],
  providers: [
    {
      provide: NEWS_FETCH,
      useFactory: (): NewsFetch => globalThis.fetch.bind(globalThis),
    },
    GuardianClient,
    NewsContentService,
    NewsIngestionService,
    SuccessResponseInterceptor,
    ApiExceptionFilter,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class NewsIngestionModule {}
