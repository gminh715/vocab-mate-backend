import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import { AuthenticatedUserThrottlerGuard } from '../../../common/guards/authenticated-user-throttler.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ArticleSlugParamsDto } from '../../articles/dto/get-articles-query.dto';
import {
  ReadingHistoryQueryDto,
  ReadingProgressParamsDto,
  ReadingTermParamsDto,
  UpdateReadingProgressDto,
} from '../dto/reading-request.dto';
import {
  ContextualTermLookupSuccessResponseDto,
  ReaderArticleSuccessResponseDto,
  ReadingHistorySuccessResponseDto,
  ReadingProgressSuccessResponseDto,
} from '../dto/reading-response.dto';
import { ContextualTermsService } from '../services/contextual-terms.service';
import { ReadingService } from '../services/reading.service';

@ApiTags('Reading')
@Controller('reading')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('BearerAuth')
export class ReadingController {
  constructor(
    private readonly readingService: ReadingService,
    private readonly contextualTermsService: ContextualTermsService,
  ) {}

  @Get('history')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getReadingHistory',
    summary: 'Get the authenticated user reading history',
    description:
      'Database-paginated owner-only history with safe article metadata. Historical rows remain visible when an article is archived; article contentHtml is never returned.',
  })
  @ApiOkResponse({ type: ReadingHistorySuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReadingHistoryQueryDto,
  ) {
    return this.readingService.getHistory(user.id, query);
  }

  @Get('progress/:articleId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getReadingProgressByArticleId',
    summary: 'Get owner-scoped progress for a published article',
    description:
      'Returns existing progress or a non-persisted READING/0% default. This GET does not change timestamps or create a row.',
  })
  @ApiOkResponse({ type: ReadingProgressSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'Article is missing or is not currently published.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReadingProgressParamsDto,
  ) {
    return this.readingService.getProgress(user.id, params.articleId);
  }

  @Put('progress/:articleId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'putReadingProgressByArticleId',
    summary: 'Create or partially update owner-scoped reading progress',
    description:
      'Uses the unique user/article key. Omitted fields are preserved. A value of 100 remains READING; only the complete endpoint marks COMPLETED. Existing COMPLETED progress remains COMPLETED at 100%.',
  })
  @ApiOkResponse({ type: ReadingProgressSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'Article is missing or is not currently published.',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Concurrent updates could not be serialized after retries.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  updateProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReadingProgressParamsDto,
    @Body() dto: UpdateReadingProgressDto,
  ) {
    return this.readingService.updateProgress(user.id, params.articleId, dto);
  }

  @Post('progress/:articleId/complete')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'postReadingProgressByArticleIdComplete',
    summary: 'Mark owner-scoped article progress complete',
    description:
      'Atomically upserts COMPLETED/100%, sets lastReadAt, and preserves firstOpenedAt and an existing completedAt on repeated calls.',
  })
  @ApiOkResponse({
    type: ReadingProgressSuccessResponseDto,
    example: {
      success: true,
      data: {
        progress: {
          articleId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'COMPLETED',
          progressPercent: 100,
          lastBlockKey: 'paragraph-3',
          completedAt: '2026-07-23T03:30:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'Article is missing or is not currently published.',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Concurrent updates could not be serialized after retries.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  completeProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReadingProgressParamsDto,
  ) {
    return this.readingService.completeProgress(user.id, params.articleId);
  }

  @Delete('progress/:articleId')
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteReadingProgressByArticleId',
    summary: 'Delete only the authenticated user article-progress row',
    description:
      'Does not delete saved vocabulary, collections, quizzes, or review history. Archived-article progress may still be reset by its owner.',
  })
  @ApiNoContentResponse({ description: 'Reading progress deleted.' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'The authenticated user has no progress for this article.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async deleteProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReadingProgressParamsDto,
  ): Promise<void> {
    await this.readingService.deleteProgress(user.id, params.articleId);
  }

  @Get('articles/:slug')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getReadingArticlesBySlug',
    summary: 'Get the personalized published-article reader payload',
    description:
      'USER and ADMIN endpoint. Returns sanitized current-version HTML, CEFR-personalized term IDs, and existing progress or a non-persisted default. The request never writes progress or lastReadAt.',
  })
  @ApiOkResponse({
    type: ReaderArticleSuccessResponseDto,
    description:
      'Published reader payload. highlightedTermIds contains IDs only.',
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'The authenticated account is not allowed to read.',
  })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'Article is missing, draft, or archived.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getReaderArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ArticleSlugParamsDto,
  ) {
    return this.readingService.getReaderArticle(user.id, params.slug);
  }

  @Get('articles/:articleId/terms/:termId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @UseGuards(AuthenticatedUserThrottlerGuard)
  @ApiOperation({
    operationId: 'getReadingArticlesByArticleIdTermsByTermId',
    summary: 'Get or lazily enrich an approved exact contextual term',
    description:
      'Returns only an approved active lookup-enabled term and active parent sentence from the published current content version. PENDING or FAILED enrichment is atomically claimed, generated outside a transaction, validated, and cached by the exact article_sentence_terms.id without exposing provider details. saveState is scoped to the authenticated user and exact contextual term.',
  })
  @ApiOkResponse({
    type: ContextualTermLookupSuccessResponseDto,
    description: 'Contextual lookup popup payload.',
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'Contextual lookup is disabled for this term.',
  })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description:
      'Published article or active current-version contextual term was not found.',
  })
  @ApiServiceUnavailableResponse({
    type: ApiErrorResponseDto,
    description:
      'Enrichment is already processing or the provider could not produce a safe result. The request may be retried later.',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getContextualTerm(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReadingTermParamsDto,
  ) {
    return this.contextualTermsService.getContextualTerm(
      user.id,
      params.articleId,
      params.termId,
    );
  }
}
