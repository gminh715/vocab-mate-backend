import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
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
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '../../../../generated/prisma/enums';
import { AuthenticatedUserThrottlerGuard } from '../../../common/guards/authenticated-user-throttler.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  RevealReviewHintDto,
  ReviewPreparationParamsDto,
  ReviewSessionItemParamsDto,
  ReviewSessionParamsDto,
  SkipReviewSessionItemDto,
  StartReviewSessionDto,
  SubmitReviewAnswerDto,
} from '../dto/review-request.dto';
import {
  AbandonReviewSessionSuccessResponseDto,
  CompletedReviewResultSuccessResponseDto,
  RevealedReviewHintSuccessResponseDto,
  ReviewPreparationProgressSuccessResponseDto,
  ReviewSessionStateSuccessResponseDto,
  SkipReviewItemSuccessResponseDto,
  StartReviewSessionSuccessResponseDto,
  SubmitReviewAnswerSuccessResponseDto,
} from '../dto/review-response.dto';
import { ReviewsService } from '../services/reviews.service';

const validationErrorExample = {
  success: false,
  error: {
    code: 'BAD_REQUEST',
    message: 'Validation failed',
    details: ['reviewGoal must be a valid enum value'],
  },
};
const notFoundErrorExample = {
  success: false,
  error: {
    code: 'NOT_FOUND',
    message: 'Review resource not found',
  },
};
const conflictErrorExample = {
  success: false,
  error: {
    code: 'CONFLICT',
    message: 'The review item is no longer active',
  },
};

@ApiTags('Review Sessions')
@Controller('review-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class ReviewSessionsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @Version('1')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(AuthenticatedUserThrottlerGuard)
  @ApiOperation({
    operationId: 'createReviewSession',
    summary: 'Create or resume a review session',
  })
  @ApiCreatedResponse({ type: StartReviewSessionSuccessResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid Daily Review settings.',
    type: ApiErrorResponseDto,
    example: validationErrorExample,
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    description: 'Eligible vocabulary was not found.',
    type: ApiErrorResponseDto,
    example: notFoundErrorExample,
  })
  @ApiConflictResponse({
    description: 'The active session could not be created consistently.',
    type: ApiErrorResponseDto,
    example: conflictErrorExample,
  })
  @ApiServiceUnavailableResponse({
    description:
      'Eligible vocabulary exists, but no valid AI question is currently available. The request can be retried.',
    type: ApiErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({
    description: 'Unexpected persistence failure.',
    type: ApiErrorResponseDto,
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartReviewSessionDto,
  ) {
    return this.reviewsService.startSession(user.id, dto);
  }

  @Get('active')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getActiveReviewSession',
    summary: "Get the current user's most recent active review session",
  })
  @ApiOkResponse({ type: ReviewSessionStateSuccessResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getActive(@CurrentUser() user: AuthenticatedUser) {
    return this.reviewsService.getActiveSession(user.id);
  }

  @Get('preparations/:preparationId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getReviewPreparationProgress',
    summary: 'Get progress for an in-flight review-session preparation',
  })
  @ApiOkResponse({ type: ReviewPreparationProgressSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getPreparationProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewPreparationParamsDto,
  ) {
    return this.reviewsService.getPreparationProgress(
      user.id,
      params.preparationId,
    );
  }

  @Get(':sessionId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getReviewSession',
    summary: 'Get an owned review session with progress and its active item',
  })
  @ApiOkResponse({ type: ReviewSessionStateSuccessResponseDto })
  @ApiBadRequestResponse({
    description: 'The session identifier is invalid.',
    type: ApiErrorResponseDto,
    example: validationErrorExample,
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewSessionParamsDto,
  ) {
    return this.reviewsService.getSession(user.id, params.sessionId);
  }

  @Post(':sessionId/items/:reviewSessionItemId/hints')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'revealReviewHint',
    summary: 'Reveal the next word for the active fill-blank question',
  })
  @ApiOkResponse({ type: RevealedReviewHintSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  revealHint(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewSessionItemParamsDto,
    @Body() dto: RevealReviewHintDto,
  ) {
    return this.reviewsService.revealHint(
      user.id,
      params.sessionId,
      params.reviewSessionItemId,
      dto.hintIndex,
    );
  }

  @Post(':sessionId/answers')
  @Version('1')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(AuthenticatedUserThrottlerGuard)
  @ApiOperation({
    operationId: 'submitReviewAnswer',
    summary: 'Submit and transactionally apply the active answer attempt',
  })
  @ApiCreatedResponse({ type: SubmitReviewAnswerSuccessResponseDto })
  @ApiBadRequestResponse({
    description: 'The session identifier or answer payload is invalid.',
    type: ApiErrorResponseDto,
    example: validationErrorExample,
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    description:
      'The owned session, question, or selected option was not found.',
    type: ApiErrorResponseDto,
    example: notFoundErrorExample,
  })
  @ApiConflictResponse({
    description:
      'The submitted item is stale, duplicated, or no longer the active item.',
    type: ApiErrorResponseDto,
    example: conflictErrorExample,
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
  submitAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewSessionParamsDto,
    @Body() dto: SubmitReviewAnswerDto,
  ) {
    return this.reviewsService.submitAnswer(user.id, params.sessionId, dto);
  }

  @Post(':sessionId/skip')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'skipReviewItem',
    summary: 'Skip and transactionally schedule the active review item',
  })
  @ApiOkResponse({ type: SkipReviewItemSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  skip(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewSessionParamsDto,
    @Body() dto: SkipReviewSessionItemDto,
  ) {
    return this.reviewsService.skipItem(user.id, params.sessionId, dto);
  }

  @Post(':sessionId/abandon')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'abandonReviewSession',
    summary: 'Abandon an in-progress owned review session',
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

  @Get(':sessionId/summary')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getReviewSessionSummary',
    summary: 'Get the completed summary and submitted answers',
  })
  @ApiOkResponse({ type: CompletedReviewResultSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewSessionParamsDto,
  ) {
    return this.reviewsService.getSummary(user.id, params.sessionId);
  }
}
