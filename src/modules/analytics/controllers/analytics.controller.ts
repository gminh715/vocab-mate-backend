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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums';
import { ApiExceptionFilter } from '../../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../../common/interceptors/success-response.interceptor';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApiErrorResponseDto } from '../../auth/dto/auth-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AnalyticsService } from '../analytics.service';
import {
  AnalyticsDateRangeQueryDto,
  QuizAnalyticsQueryDto,
  VocabularyAnalyticsQueryDto,
} from '../dto/analytics-query.dto';
import {
  AnalyticsOverviewSuccessResponseDto,
  QuizAnalyticsSuccessResponseDto,
  ReadingAnalyticsSuccessResponseDto,
  VocabularyAnalyticsSuccessResponseDto,
} from '../dto/analytics-response.dto';

@ApiTags('Analytics')
@Controller('analytics')
@UseInterceptors(SuccessResponseInterceptor)
@UseFilters(ApiExceptionFilter)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('me/overview')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getMyAnalyticsOverview',
    summary: 'Get the authenticated learner analytics overview',
    description:
      'Saved, due, and mastered vocabulary are current stock metrics. Completed articles, completed sessions, and answer-level quiz accuracy use from <= timestamp < to. The default range is 30 days and the maximum is 366 days.',
  })
  @ApiOkResponse({
    type: AnalyticsOverviewSuccessResponseDto,
    description:
      'Zero-data response contains numeric zero for all fields, including quizAccuracy.',
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsDateRangeQueryDto,
  ) {
    return this.analyticsService.getOverview(user.id, query);
  }

  @Get('me/vocabulary')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getMyVocabularyAnalytics',
    summary: 'Get the authenticated learner vocabulary analytics',
    description:
      'Totals, status counts, and saved CEFR snapshot counts are current stock metrics. savedTrend uses the requested half-open range in the configured analytics timezone and fills empty buckets. groupBy defaults to DAY for ranges up to 31 days, WEEK for ranges up to 180 days, and MONTH otherwise.',
  })
  @ApiOkResponse({ type: VocabularyAnalyticsSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  getVocabularyAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: VocabularyAnalyticsQueryDto,
  ) {
    return this.analyticsService.getVocabularyAnalytics(user.id, query);
  }

  @Get('me/reading')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getMyReadingAnalytics',
    summary: 'Get the authenticated learner reading analytics',
    description:
      'Uses the firstOpenedAt cohort in the requested half-open range. Completed and trend counts use that same cohort, retain archived article and inactive-category history, and return zero ratios for empty denominators.',
  })
  @ApiOkResponse({ type: ReadingAnalyticsSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  getReadingAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsDateRangeQueryDto,
  ) {
    return this.analyticsService.getReadingAnalytics(user.id, query);
  }

  @Get('me/quizzes')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getMyQuizAnalytics',
    summary: 'Get the authenticated learner quiz analytics',
    description:
      'Includes only COMPLETED review sessions completed in the requested half-open range. Accuracy is answer-level; averageScore is the mean normalized active-question point ratio across sessions with a non-zero denominator. Zero-data responses include all question types and trend buckets.',
  })
  @ApiOkResponse({ type: QuizAnalyticsSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  getQuizAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuizAnalyticsQueryDto,
  ) {
    return this.analyticsService.getQuizAnalytics(user.id, query);
  }
}
