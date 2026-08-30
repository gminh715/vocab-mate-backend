import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums';
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  TutorHistoryQueryDto,
  TutorHistorySuccessResponseDto,
} from '../dto/history-query.dto';
import { SubmitAnswerSuccessResponseDto } from '../dto/session-item-response.dto';
import {
  TutorSessionDetailSuccessResponseDto,
  TutorSessionSuccessResponseDto,
} from '../dto/session-response.dto';
import {
  SubmitAnswerDto,
  TutorSessionItemParamsDto,
  TutorSessionParamsDto,
} from '../dto/submit-answer.dto';
import { TodayStatusSuccessResponseDto } from '../dto/today-status-response.dto';
import { TutorService } from '../services/tutor.service';

/**
 * HTTP boundary for the Agentic Vocabulary Tutor feature.
 * All operations are strictly scoped to the authenticated user from JWT.
 */
@ApiTags('Tutor')
@Controller('tutor-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class TutorController {
  constructor(private readonly tutorService: TutorService) {}

  @Get('today')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getTodayTutorStatus',
    summary: "Get today's tutor session status, readiness, and due count",
    description:
      "Calculates whether a session can be started or resumed for today's study date in Asia/Ho_Chi_Minh timezone.",
  })
  @ApiOkResponse({ type: TodayStatusSuccessResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getTodayStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.tutorService.getTodayStatus(user.id);
  }

  @Post()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'startOrResumeTutorSession',
    summary: 'Start a new daily tutor session or resume an active one',
    description:
      'Creates a new session for today if none exists, or returns the existing ACTIVE session and its current question. Rejects second session if already completed/abandoned today.',
  })
  @ApiOkResponse({ type: TutorSessionSuccessResponseDto })
  @ApiCreatedResponse({ type: TutorSessionSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  startOrResumeSession(@CurrentUser() user: AuthenticatedUser) {
    return this.tutorService.startOrResumeSession(user.id);
  }

  @Get('history')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getTutorHistory',
    summary: 'Get paginated history of tutor sessions',
    description:
      'Returns completed and historical tutor sessions using cursor-based keyset pagination.',
  })
  @ApiOkResponse({ type: TutorHistorySuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TutorHistoryQueryDto,
  ) {
    return this.tutorService.getHistory(user.id, query);
  }

  @Get(':sessionId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getTutorSession',
    summary: 'Get tutor session state, current activity, or completion summary',
    description:
      'Retrieves the session by ID. If active with no pending activity, triggers generation of the next activity.',
  })
  @ApiOkResponse({ type: TutorSessionSuccessResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: TutorSessionParamsDto,
  ) {
    return this.tutorService.getSession(user.id, params.sessionId);
  }

  @Get(':sessionId/detail')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getTutorSessionDetail',
    summary:
      'Get full session review with all answered questions and explanations',
    description:
      'For history review: retrieves all items with user answers, canonical correct answers, and explanations.',
  })
  @ApiOkResponse({ type: TutorSessionDetailSuccessResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getSessionDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: TutorSessionParamsDto,
  ) {
    return this.tutorService.getSessionDetail(user.id, params.sessionId);
  }

  @Post(':sessionId/items/:itemId/answers')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'submitTutorItemAnswer',
    summary: 'Submit an answer for the current pending activity item',
    description:
      'Grades the answer deterministically, updates FSRS card parameters atomically, and marks the item as answered.',
  })
  @ApiOkResponse({ type: SubmitAnswerSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  submitAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: TutorSessionItemParamsDto,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.tutorService.submitAnswer(
      user.id,
      params.sessionId,
      params.itemId,
      dto,
    );
  }

  @Post(':sessionId/abandon')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'abandonTutorSession',
    summary: 'Abandon an active tutor session',
    description:
      'Terminates the session early and marks any pending items as SKIPPED. Cannot start another session today.',
  })
  @ApiOkResponse({ type: TutorSessionSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  abandonSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: TutorSessionParamsDto,
  ) {
    return this.tutorService.abandonSession(user.id, params.sessionId);
  }
}
