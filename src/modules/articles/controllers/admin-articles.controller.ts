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
  AdminArticleListQueryDto,
  AdminArticleParamsDto,
  CreateArticleDto,
  UpdateArticleDto,
} from '../dto/admin-article.dto';
import {
  ArticleArchiveSuccessResponseDto,
  ArticlePreviewQueryDto,
  ArticlePreviewSuccessResponseDto,
  ArticlePublishSuccessResponseDto,
  ArticleRestoreDraftSuccessResponseDto,
  PublicationValidationErrorResponseDto,
} from '../dto/article-publication.dto';
import {
  ParseArticleContentDto,
  ParseArticleContentSuccessResponseDto,
} from '../dto/article-sentence.dto';
import { ArticleAnalysisSuccessResponseDto } from '../dto/article-analysis.dto';
import {
  AdminArticleDetailSuccessResponseDto,
  AdminArticleListSuccessResponseDto,
  ArticleMutationSuccessResponseDto,
  ArticleUpdateSuccessResponseDto,
} from '../dto/article-response.dto';
import { ArticlesService } from '../services/articles.service';
import { ArticleAnalysisService } from '../services/article-analysis.service';
import { ArticlePublicationService } from '../services/article-publication.service';
import { ArticleSentencesService } from '../services/article-sentences.service';

@ApiTags('Admin Articles')
@Controller('admin/articles')
@UseInterceptors(SuccessResponseInterceptor)
@UseFilters(ApiExceptionFilter)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class AdminArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly articleAnalysisService: ArticleAnalysisService,
    private readonly articleSentencesService: ArticleSentencesService,
    private readonly articlePublicationService: ArticlePublicationService,
  ) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminArticles',
    summary: 'List articles for administration',
    description:
      'ADMIN-only database-paginated list across draft, published, and archived articles. Article HTML is excluded.',
  })
  @ApiOkResponse({ type: AdminArticleListSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findAll(@Query() query: AdminArticleListQueryDto) {
    return this.articlesService.findAllAdmin(query);
  }

  @Get(':articleId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminArticlesByArticleId',
    summary: 'Get article administration detail',
    description:
      'Returns current article content and aggregate current-version sentence, term, and quiz counts without loading related records.',
  })
  @ApiOkResponse({ type: AdminArticleDetailSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findOne(@Param() params: AdminArticleParamsDto) {
    return this.articlesService.findOneAdmin(params.articleId);
  }

  @Post()
  @Version('1')
  @ApiOperation({
    operationId: 'postAdminArticles',
    summary: 'Create a draft article',
    description:
      'Creates contentVersion 1 as DRAFT, sanitizes HTML, and derives audit identities from the verified JWT.',
  })
  @ApiCreatedResponse({ type: ArticleMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  create(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Body() dto: CreateArticleDto,
  ) {
    return this.articlesService.create(actingAdmin.id, dto);
  }

  @Post(':articleId/parse-content')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'postAdminArticleParseContent',
    summary: 'Parse and annotate current article content',
    description:
      'Sanitizes and segments visible reading text, then atomically replaces current-version sentence rows and annotated contentHtml without incrementing contentVersion.',
  })
  @ApiOkResponse({ type: ParseArticleContentSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  parseContent(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminArticleParamsDto,
    @Body() dto: ParseArticleContentDto,
  ) {
    return this.articleSentencesService.parseContent(
      actingAdmin.id,
      params.articleId,
      dto,
    );
  }

  @Post(':articleId/analyze')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'postAdminArticleAnalyze',
    summary: 'Analyze a parsed draft and create local vocabulary terms',
    description:
      'Atomically claims one parsed DRAFT, tokenizes each sentence locally with WinkNLP, stores approved lookup terms with deferred metadata, and inserts one exact data-term-id marker per unique sentence surface only if the content version is unchanged.',
  })
  @ApiOkResponse({ type: ArticleAnalysisSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  analyze(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminArticleParamsDto,
  ) {
    return this.articleAnalysisService.analyze(
      actingAdmin.id,
      params.articleId,
    );
  }

  @Post(':articleId/publish')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'postAdminArticlePublish',
    summary: 'Publish a validated draft article',
    description:
      'Explicit ADMIN action that runs the shared publication checklist and conditionally transitions the unchanged draft to PUBLISHED. Analysis and moderation never publish automatically.',
  })
  @ApiOkResponse({ type: ArticlePublishSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({
    type: PublicationValidationErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  publish(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminArticleParamsDto,
  ) {
    return this.articlePublicationService.publish(
      actingAdmin.id,
      params.articleId,
    );
  }

  @Post(':articleId/archive')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'postAdminArticleArchive',
    summary: 'Archive a draft or published article',
    description:
      'Conditionally hides the article without deleting content, learning progress, vocabulary, quizzes, or history.',
  })
  @ApiOkResponse({ type: ArticleArchiveSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  archive(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminArticleParamsDto,
  ) {
    return this.articlePublicationService.archive(
      actingAdmin.id,
      params.articleId,
    );
  }

  @Post(':articleId/restore-draft')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'postAdminArticleRestoreDraft',
    summary: 'Restore an archived article as a draft',
    description:
      'Preserves content caches while clearing publication/archive timestamps so validation must run again before publishing.',
  })
  @ApiOkResponse({ type: ArticleRestoreDraftSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  restoreDraft(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminArticleParamsDto,
  ) {
    return this.articlePublicationService.restoreDraft(
      actingAdmin.id,
      params.articleId,
    );
  }

  @Get(':articleId/preview')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminArticlePreview',
    summary: 'Preview current render-ready article content',
    description:
      'Read-only preview of DRAFT or PUBLISHED content with current active lookup terms, CEFR highlighting, and warnings from the publication checklist.',
  })
  @ApiOkResponse({ type: ArticlePreviewSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  preview(
    @Param() params: AdminArticleParamsDto,
    @Query() query: ArticlePreviewQueryDto,
  ) {
    return this.articlePublicationService.preview(
      params.articleId,
      query.cefrLevel,
    );
  }

  @Patch(':articleId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchAdminArticlesByArticleId',
    summary: 'Update article metadata or content',
    description:
      'Partial update. Changed HTML is sanitized, increments contentVersion once, and atomically invalidates the previous sentence cache.',
  })
  @ApiOkResponse({ type: ArticleUpdateSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminArticleParamsDto,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.articlesService.update(actingAdmin.id, params.articleId, dto);
  }

  @Delete(':articleId')
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteAdminArticlesByArticleId',
    summary: 'Delete an unused draft article',
    description:
      'Hard deletion is limited to drafts with no learning, quiz, or review history. Used articles should be archived.',
  })
  @ApiNoContentResponse({ description: 'Unused draft deleted.' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async delete(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminArticleParamsDto,
  ): Promise<void> {
    await this.articlesService.delete(actingAdmin.id, params.articleId);
  }
}
