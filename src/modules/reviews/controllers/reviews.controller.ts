import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
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
import {
  GetDueReviewsQueryDto,
  GetReviewHistoryQueryDto,
  ReviewSessionParamsDto,
  StartReviewSessionDto,
  SubmitReviewAnswerDto,
} from '../dto/review-request.dto';
import {
  AbandonReviewSessionSuccessResponseDto,
  CompleteReviewSessionSuccessResponseDto,
  CompletedReviewResultSuccessResponseDto,
  DueReviewsSuccessResponseDto,
  ReviewHistorySuccessResponseDto,
  ReviewSessionStateSuccessResponseDto,
  StartReviewSessionSuccessResponseDto,
  SubmitReviewAnswerSuccessResponseDto,
} from '../dto/review-response.dto';
import { ReviewsService } from '../services/reviews.service';

@ApiTags('Reviews')
@Controller('reviews')
@UseInterceptors(SuccessResponseInterceptor)
@UseFilters(ApiExceptionFilter)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('sessions')
  @Version('1')
  @ApiOperation({
    operationId: 'startReviewSession',
    summary: 'Start a quiz review session',
  })
  @ApiCreatedResponse({ type: StartReviewSessionSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartReviewSessionDto,
  ) {
    return this.reviewsService.startQuizSession(user.id, dto.quizId);
  }

  @Get('sessions/:sessionId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getReviewSession',
    summary: 'Get owned quiz-session state and next question',
  })
  @ApiOkResponse({ type: ReviewSessionStateSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewSessionParamsDto,
  ) {
    return this.reviewsService.getSession(user.id, params.sessionId);
  }

  @Post('sessions/:sessionId/answers')
  @Version('1')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'submitReviewAnswer',
    summary: 'Submit and grade one immutable quiz answer',
  })
  @ApiCreatedResponse({ type: SubmitReviewAnswerSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  submitAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewSessionParamsDto,
    @Body() dto: SubmitReviewAnswerDto,
  ) {
    return this.reviewsService.submitAnswer(user.id, params.sessionId, dto);
  }

  @Post('sessions/:sessionId/complete')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'completeReviewSession',
    summary: 'Complete a fully answered quiz session',
  })
  @ApiOkResponse({ type: CompleteReviewSessionSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewSessionParamsDto,
  ) {
    return this.reviewsService.completeSession(user.id, params.sessionId);
  }

  @Post('sessions/:sessionId/abandon')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'abandonReviewSession',
    summary: 'Abandon an in-progress quiz session',
  })
  @ApiOkResponse({ type: AbandonReviewSessionSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  abandon(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewSessionParamsDto,
  ) {
    return this.reviewsService.abandonSession(user.id, params.sessionId);
  }

  @Get('history')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getReviewHistory',
    summary: 'List owned review-session history',
  })
  @ApiOkResponse({ type: ReviewHistorySuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetReviewHistoryQueryDto,
  ) {
    return this.reviewsService.getHistory(user.id, query);
  }

  @Get('sessions/:sessionId/result')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getReviewResult',
    summary: 'Get a completed owned session result and answers',
  })
  @ApiOkResponse({ type: CompletedReviewResultSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  getResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewSessionParamsDto,
  ) {
    return this.reviewsService.getResult(user.id, params.sessionId);
  }

  @Get('due')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getDueReviews',
    summary: 'Get deterministic due-vocabulary quiz recommendations',
  })
  @ApiOkResponse({ type: DueReviewsSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  getDue(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetDueReviewsQueryDto,
  ) {
    return this.reviewsService.getDue(user.id, query);
  }
}
