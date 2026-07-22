import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './database/prisma.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { HealthModule } from './modules/health/health.module';
import { QuizzesModule } from './modules/quizzes/quizzes.module';
import { ReadingModule } from './modules/reading/reading.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { UsersModule } from './modules/users/users.module';
import { VocabulariesModule } from './modules/vocabularies/vocabularies.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
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
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
