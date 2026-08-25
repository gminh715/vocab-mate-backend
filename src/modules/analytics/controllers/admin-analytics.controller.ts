import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums';
import { ApiExceptionFilter } from '../../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../../common/interceptors/success-response.interceptor';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApiErrorResponseDto } from '../../auth/dto/auth-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ANALYTICS_TOP_CONTENT_LIMIT } from '../repositories/admin-analytics.repository';
import { AdminAnalyticsService } from '../services/admin-analytics.service';
import {
  AdminContentAnalyticsQueryDto,
  AdminUserAnalyticsQueryDto,
  AnalyticsDateRangeQueryDto,
} from '../dto/analytics-query.dto';
import {
  AdminAnalyticsOverviewSuccessResponseDto,
  AdminContentAnalyticsSuccessResponseDto,
  AdminUserAnalyticsSuccessResponseDto,
} from '../dto/analytics-response.dto';

@ApiTags('Admin Analytics')
@Controller('admin/analytics')
@UseInterceptors(SuccessResponseInterceptor)
@UseFilters(ApiExceptionFilter)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  @Get('overview')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminAnalyticsOverview',
    summary: 'Get aggregate operational analytics',
    description:
      'ADMIN only. Users and articles are current all-status stock metrics. Active users are distinct learners with reading, vocabulary-save, or review-session activity in the half-open range. Saved vocabulary and completed sessions are period flows. Returns aggregate numbers only and zeroes when no data exists.',
  })
  @ApiOkResponse({
    type: AdminAnalyticsOverviewSuccessResponseDto,
    example: {
      success: true,
      data: {
        users: 120,
        activeUsers: 64,
        articles: 48,
        publishedArticles: 32,
        savedVocabulary: 310,
        completedSessions: 85,
      },
    },
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  getOverview(@Query() query: AnalyticsDateRangeQueryDto) {
    return this.analyticsService.getAdminOverview(query);
  }

  @Get('content')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminContentAnalytics',
    summary: 'Get bounded aggregate content analytics',
    description: `ADMIN only. Every ranked array is limited to the server-side top ${ANALYTICS_TOP_CONTENT_LIMIT}. Reading uses the first-opened cohort; quiz accuracy and normalized score match learner analytics. categoryId applies to every metric without excluding inactive categories or archived history. Empty data returns four empty arrays.`,
  })
  @ApiOkResponse({
    type: AdminContentAnalyticsSuccessResponseDto,
    example: {
      success: true,
      data: {
        topArticles: [
          {
            articleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            title: 'Example article',
            slug: 'example-article',
            status: 'ARCHIVED',
            category: 'Business',
            openedCount: 20,
            completedCount: 15,
            savedVocabularyCount: 30,
            completedQuizSessions: 12,
          },
        ],
        completionRates: [
          {
            articleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            title: 'Example article',
            opened: 20,
            completed: 15,
            completionRate: 0.75,
          },
        ],
        termSaveCounts: [],
        quizPerformance: [],
      },
    },
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  getContent(@Query() query: AdminContentAnalyticsQueryDto) {
    return this.analyticsService.getAdminContentAnalytics(query);
  }

  @Get('users')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminUserAnalytics',
    summary: 'Get aggregate user-activity analytics',
    description:
      'ADMIN only. status applies consistently to registrations, active learners, retention proxy, and distribution. The retention proxy compares activity in equal first/second windows and is not signup-cohort or D1/D7/D30 retention. Distribution is mutually exclusive across reading-only, vocabulary-only, quiz-only, multi-activity, and inactive users. No PII is returned.',
  })
  @ApiOkResponse({ type: AdminUserAnalyticsSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  getUsers(@Query() query: AdminUserAnalyticsQueryDto) {
    return this.analyticsService.getAdminUserAnalytics(query);
  }
}
