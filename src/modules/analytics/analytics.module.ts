import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminAnalyticsController } from './controllers/admin-analytics.controller';
import { AnalyticsController } from './controllers/analytics.controller';
import { AdminAnalyticsRepository } from './repositories/admin-analytics.repository';
import { LearnerAnalyticsRepository } from './repositories/learner-analytics.repository';
import { ReviewAnalyticsRepository } from './repositories/review-analytics.repository';
import { AdminAnalyticsService } from './services/admin-analytics.service';
import { LearnerAnalyticsService } from './services/learner-analytics.service';
import { ReviewAnalyticsService } from './services/review-analytics.service';

@Module({
  controllers: [AnalyticsController, AdminAnalyticsController],
  providers: [
    LearnerAnalyticsService,
    ReviewAnalyticsService,
    AdminAnalyticsService,
    LearnerAnalyticsRepository,
    ReviewAnalyticsRepository,
    AdminAnalyticsRepository,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AnalyticsModule {}
