import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
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
  CreateQuestionOptionDto,
  CreateQuizQuestionDto,
  OptionParamsDto,
  QuestionParamsDto,
  UpdateQuestionOptionDto,
  UpdateQuizQuestionDto,
} from '../dto/quiz-question-request.dto';
import {
  CreateQuizDto,
  GetAdminQuizzesQueryDto,
  QuizParamsDto,
  UpdateQuizDto,
} from '../dto/quiz-request.dto';
import {
  AdminQuizDetailSuccessResponseDto,
  AdminQuizListSuccessResponseDto,
  QuestionOptionMutationSuccessResponseDto,
  QuizMutationSuccessResponseDto,
  QuizPublicationValidationErrorResponseDto,
  QuizPublishSuccessResponseDto,
  QuizQuestionDetailSuccessResponseDto,
  QuizQuestionMutationSuccessResponseDto,
  QuizStatusTransitionSuccessResponseDto,
} from '../dto/quiz-response.dto';
import { QuizPublicationService } from '../services/quiz-publication.service';
import { QuizQuestionsService } from '../services/quiz-questions.service';
import { QuizzesService } from '../services/quizzes.service';

@ApiTags('Admin Quizzes')
@Controller('admin/quizzes')
@UseInterceptors(SuccessResponseInterceptor)
@UseFilters(ApiExceptionFilter)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class AdminQuizzesController {
  constructor(
    private readonly quizzesService: QuizzesService,
    private readonly quizQuestionsService: QuizQuestionsService,
    private readonly quizPublicationService: QuizPublicationService,
  ) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminQuizzes',
    summary: 'List quizzes for administration',
    description:
      'ADMIN-only database-paginated list across all quiz statuses with active question counts.',
  })
  @ApiOkResponse({ type: AdminQuizListSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findAll(@Query() query: GetAdminQuizzesQueryDto) {
    return this.quizzesService.findAllAdmin(query);
  }

  @Get(':quizId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminQuizzesByQuizId',
    summary: 'Get quiz questions and options for administration',
    description:
      'ADMIN-only detail. Questions and options are deterministically ordered and include answer information without audit-user objects.',
  })
  @ApiOkResponse({ type: AdminQuizDetailSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findOne(@Param() params: QuizParamsDto) {
    return this.quizzesService.findOneAdmin(params.quizId);
  }

  @Post()
  @Version('1')
  @ApiOperation({
    operationId: 'postAdminQuizzes',
    summary: 'Create a draft quiz',
    description:
      'ADMIN-only creation. Status and publication time are server-controlled, and audit identities come from the verified JWT.',
  })
  @ApiCreatedResponse({ type: QuizMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  create(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Body() dto: CreateQuizDto,
  ) {
    return this.quizzesService.create(actingAdmin.id, dto);
  }

  @Patch(':quizId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchAdminQuizzesByQuizId',
    summary: 'Update quiz metadata',
    description:
      'ADMIN-only partial title or description update. Article, status, publication time, questions, and creator audit data cannot be changed.',
  })
  @ApiOkResponse({ type: QuizMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: QuizParamsDto,
    @Body() dto: UpdateQuizDto,
  ) {
    return this.quizzesService.update(actingAdmin.id, params.quizId, dto);
  }

  @Delete(':quizId')
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteAdminQuizzesByQuizId',
    summary: 'Delete an unused draft quiz',
    description:
      'ADMIN-only hard delete. Published, archived, or review-referenced quizzes are retained.',
  })
  @ApiNoContentResponse({ description: 'Unused draft quiz deleted.' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async delete(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: QuizParamsDto,
  ): Promise<void> {
    await this.quizzesService.delete(actingAdmin.id, params.quizId);
  }

  @Post(':quizId/publish')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'postAdminQuizPublish',
    summary: 'Publish a structurally complete draft quiz',
    description:
      'ADMIN-only. Validates the published article, current active terms, active questions, and complete answer structure before a conditional DRAFT-to-PUBLISHED transition.',
  })
  @ApiOkResponse({ type: QuizPublishSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({
    type: QuizPublicationValidationErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  publish(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: QuizParamsDto,
  ) {
    return this.quizPublicationService.publish(actingAdmin.id, params.quizId);
  }

  @Post(':quizId/archive')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'postAdminQuizArchive',
    summary: 'Archive a draft or published quiz',
    description:
      'ADMIN-only conditional transition. Publication time, questions, options, review sessions, answers, and article state are preserved.',
  })
  @ApiOkResponse({ type: QuizStatusTransitionSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  archive(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: QuizParamsDto,
  ) {
    return this.quizPublicationService.archive(actingAdmin.id, params.quizId);
  }

  @Post(':quizId/restore-draft')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'postAdminQuizRestoreDraft',
    summary: 'Restore an unused archived quiz to draft',
    description:
      'ADMIN-only. Review history blocks restoration so historical quiz content cannot become editable without snapshots.',
  })
  @ApiOkResponse({ type: QuizStatusTransitionSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  restoreDraft(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: QuizParamsDto,
  ) {
    return this.quizPublicationService.restoreDraft(
      actingAdmin.id,
      params.quizId,
    );
  }

  @Post(':quizId/questions')
  @Version('1')
  @ApiOperation({
    operationId: 'postAdminQuizQuestions',
    summary: 'Create a draft quiz question',
    description:
      'ADMIN-only. The source term must be active in the current version of the quiz article. Quiz content is immutable after publication or first review session.',
  })
  @ApiCreatedResponse({ type: QuizQuestionMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  createQuestion(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: QuizParamsDto,
    @Body() dto: CreateQuizQuestionDto,
  ) {
    return this.quizQuestionsService.createQuestion(
      actingAdmin.id,
      params.quizId,
      dto,
    );
  }

  @Get(':quizId/questions/:questionId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminQuizQuestionsByQuestionId',
    summary: 'Get one quiz question and its options',
    description:
      'ADMIN-only. Cross-quiz question identifiers return the same not-found response as missing questions.',
  })
  @ApiOkResponse({ type: QuizQuestionDetailSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findQuestion(@Param() params: QuestionParamsDto) {
    return this.quizQuestionsService.findQuestion(
      params.quizId,
      params.questionId,
    );
  }

  @Patch(':quizId/questions/:questionId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchAdminQuizQuestionsByQuestionId',
    summary: 'Update a draft quiz question',
    description:
      'ADMIN-only merged partial update. Changing to FILL_BLANK requires all options to be removed first.',
  })
  @ApiOkResponse({ type: QuizQuestionMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  updateQuestion(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: QuestionParamsDto,
    @Body() dto: UpdateQuizQuestionDto,
  ) {
    return this.quizQuestionsService.updateQuestion(
      actingAdmin.id,
      params.quizId,
      params.questionId,
      dto,
    );
  }

  @Delete(':quizId/questions/:questionId')
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteAdminQuizQuestionsByQuestionId',
    summary: 'Delete an unused draft quiz question',
    description:
      'ADMIN-only. Review answers are retained and block deletion through pre-checks and foreign keys.',
  })
  @ApiNoContentResponse({ description: 'Unused quiz question deleted.' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async deleteQuestion(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: QuestionParamsDto,
  ): Promise<void> {
    await this.quizQuestionsService.deleteQuestion(
      actingAdmin.id,
      params.quizId,
      params.questionId,
    );
  }

  @Post(':quizId/questions/:questionId/options')
  @Version('1')
  @ApiOperation({
    operationId: 'postAdminQuizQuestionOptions',
    summary: 'Create an option for an option-based question',
    description:
      'ADMIN-only. Drafts may temporarily have any number of correct options; publication validation owns final completeness.',
  })
  @ApiCreatedResponse({ type: QuestionOptionMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  createOption(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: QuestionParamsDto,
    @Body() dto: CreateQuestionOptionDto,
  ) {
    return this.quizQuestionsService.createOption(
      actingAdmin.id,
      params.quizId,
      params.questionId,
      dto,
    );
  }

  @Patch(':quizId/questions/:questionId/options/:optionId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchAdminQuizQuestionOptionsByOptionId',
    summary: 'Update a draft question option',
    description:
      'ADMIN-only partial update with full quiz-question-option ownership validation.',
  })
  @ApiOkResponse({ type: QuestionOptionMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  updateOption(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: OptionParamsDto,
    @Body() dto: UpdateQuestionOptionDto,
  ) {
    return this.quizQuestionsService.updateOption(
      actingAdmin.id,
      params.quizId,
      params.questionId,
      params.optionId,
      dto,
    );
  }

  @Delete(':quizId/questions/:questionId/options/:optionId')
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteAdminQuizQuestionOptionsByOptionId',
    summary: 'Delete an unused draft question option',
    description:
      'ADMIN-only. Selected review answers are retained and block deletion through pre-checks and foreign keys.',
  })
  @ApiNoContentResponse({ description: 'Unused question option deleted.' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async deleteOption(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: OptionParamsDto,
  ): Promise<void> {
    await this.quizQuestionsService.deleteOption(
      actingAdmin.id,
      params.quizId,
      params.questionId,
      params.optionId,
    );
  }
}
