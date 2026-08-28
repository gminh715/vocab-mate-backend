import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
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
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  AnalyticsDateRangeQueryDto,
  VocabularyAnalyticsQueryDto,
} from '../dto/analytics-query.dto';
import {
  AnalyticsOverviewSuccessResponseDto,
  ReadingAnalyticsSuccessResponseDto,
  VocabularyAnalyticsSuccessResponseDto,
} from '../dto/analytics-response.dto';
import { LearnerAnalyticsService } from '../services/learner-analytics.service';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class AnalyticsController {
  constructor(
    private readonly learnerAnalyticsService: LearnerAnalyticsService,
  ) {}

  @Get('me/overview')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getMyAnalyticsOverview',
    summary: 'Get the authenticated learner analytics overview',
    description:
      'Saved vocabulary is a current stock metric. Completed articles use from <= timestamp < to. The default range is 30 days and the maximum is 366 days.',
  })
  @ApiOkResponse({
    type: AnalyticsOverviewSuccessResponseDto,
    description:
      'Zero-data response contains numeric zero for all fields.',
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsDateRangeQueryDto,
  ) {
    return this.learnerAnalyticsService.getOverview(user.id, query);
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
    return this.learnerAnalyticsService.getVocabularyAnalytics(user.id, query);
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
    return this.learnerAnalyticsService.getReadingAnalytics(user.id, query);
  }

}
