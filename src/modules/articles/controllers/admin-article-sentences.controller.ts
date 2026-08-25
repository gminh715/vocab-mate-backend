import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AdminArticleParamsDto } from '../dto/admin-article.dto';
import {
  ArticleTermCreateSuccessResponseDto,
  CreateArticleTermDto,
} from '../dto/article-term.dto';
import {
  ArticleSentenceDetailSuccessResponseDto,
  ArticleSentenceListQueryDto,
  ArticleSentenceListSuccessResponseDto,
  ArticleSentenceMutationSuccessResponseDto,
  ArticleSentenceParamsDto,
  UpdateArticleSentenceDto,
} from '../dto/article-sentence.dto';
import { ArticleSentencesService } from '../services/article-sentences.service';
import { ArticleTermsService } from '../services/article-terms.service';

@ApiTags('Admin Article Sentences')
@Controller('admin/articles/:articleId/sentences')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class AdminArticleSentencesController {
  constructor(
    private readonly articleSentencesService: ArticleSentencesService,
    private readonly articleTermsService: ArticleTermsService,
  ) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminArticleSentences',
    summary: 'List current-version article sentences',
    description:
      'ADMIN-only database pagination ordered by sentenceOrder. Article HTML is not returned per row.',
  })
  @ApiOkResponse({ type: ArticleSentenceListSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findAll(
    @Param() params: AdminArticleParamsDto,
    @Query() query: ArticleSentenceListQueryDto,
  ) {
    return this.articleSentencesService.findAll(params.articleId, query);
  }

  @Get(':sentenceId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminArticleSentenceById',
    summary: 'Get a current-version sentence and its terms',
  })
  @ApiOkResponse({ type: ArticleSentenceDetailSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findOne(@Param() params: ArticleSentenceParamsDto) {
    return this.articleSentencesService.findOne(
      params.articleId,
      params.sentenceId,
    );
  }

  @Patch(':sentenceId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchAdminArticleSentenceById',
    summary: 'Update current-version sentence metadata',
    description:
      'Updates only translation/explanation, skill, or active state. Sentence identity, text, order, article, and content version are immutable.',
  })
  @ApiOkResponse({ type: ArticleSentenceMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: ArticleSentenceParamsDto,
    @Body() dto: UpdateArticleSentenceDto,
  ) {
    return this.articleSentencesService.update(
      actingAdmin.id,
      params.articleId,
      params.sentenceId,
      dto,
    );
  }

  @Post(':sentenceId/terms')
  @Version('1')
  @ApiOperation({
    operationId: 'postAdminArticleSentenceTerm',
    summary: 'Create a contextual term and its HTML marker',
    description:
      'Creates current-version contextual metadata and atomically marks every valid occurrence inside only the selected active sentence.',
  })
  @ApiCreatedResponse({ type: ArticleTermCreateSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  createTerm(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: ArticleSentenceParamsDto,
    @Body() dto: CreateArticleTermDto,
  ) {
    return this.articleTermsService.create(
      actingAdmin.id,
      params.articleId,
      params.sentenceId,
      dto,
    );
  }
}
