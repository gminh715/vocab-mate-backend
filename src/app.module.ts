import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  BASELINE_RATE_LIMIT,
  BaselineThrottlerGuard,
} from './common/guards/baseline-throttler.guard';
import { RateLimitingModule } from './common/guards/rate-limiting.module';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './database/prisma.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { HealthModule } from './modules/health/health.module';
import { NewsIngestionModule } from './modules/news-ingestion/news-ingestion.module';
import { QuizzesModule } from './modules/quizzes/quizzes.module';
import { ReadingModule } from './modules/reading/reading.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { UsersModule } from './modules/users/users.module';
import { VocabulariesModule } from './modules/vocabularies/vocabularies.module';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: BASELINE_RATE_LIMIT.ttl,
        limit: BASELINE_RATE_LIMIT.limit,
      },
    ]),
    RateLimitingModule,
    PrismaModule,
    HealthModule,
    NewsIngestionModule,
    UsersModule,
    AuthModule,
    CategoriesModule,
    ArticlesModule,
    ReadingModule,
    VocabulariesModule,
    CollectionsModule,
    QuizzesModule,
    ReviewsModule,
    AnalyticsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: BaselineThrottlerGuard,
    },
  ],
})
export class AppModule {}
