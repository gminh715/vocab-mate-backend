import { Module } from '@nestjs/common';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../common/interceptors/success-response.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnalyticsService } from './analytics.service';
import { AdminAnalyticsController } from './controllers/admin-analytics.controller';
import { AnalyticsController } from './controllers/analytics.controller';

@Module({
  controllers: [AnalyticsController, AdminAnalyticsController],
  providers: [
    AnalyticsService,
    JwtAuthGuard,
    RolesGuard,
    SuccessResponseInterceptor,
    ApiExceptionFilter,
  ],
})
export class AnalyticsModule {}
