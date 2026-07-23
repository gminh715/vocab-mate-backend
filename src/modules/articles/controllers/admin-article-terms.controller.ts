import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { AdminArticleParamsDto } from '../dto/admin-article.dto';
import {
  ArticleTermDetailSuccessResponseDto,
  ArticleTermListQueryDto,
  ArticleTermListSuccessResponseDto,
  ArticleTermParamsDto,
  ArticleTermUpdateSuccessResponseDto,
  UpdateArticleTermDto,
} from '../dto/article-term.dto';
import { ArticleTermsService } from '../services/article-terms.service';

@ApiTags('Admin Article Terms')
@Controller('admin/articles/:articleId/terms')
@UseInterceptors(SuccessResponseInterceptor)
@UseFilters(ApiExceptionFilter)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class AdminArticleTermsController {
  constructor(private readonly articleTermsService: ArticleTermsService) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminArticleTerms',
    summary: 'List current-version contextual terms',
    description:
      'ADMIN-only database pagination with sentence, CEFR, unit type, active-state, and allowlisted text filters. Article HTML is excluded.',
  })
  @ApiOkResponse({ type: ArticleTermListSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findAll(
    @Param() params: AdminArticleParamsDto,
    @Query() query: ArticleTermListQueryDto,
  ) {
    return this.articleTermsService.findAll(params.articleId, query);
  }

  @Get(':termId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminArticleTermById',
    summary: 'Get a contextual term and its parent sentence',
  })
  @ApiOkResponse({ type: ArticleTermDetailSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findOne(@Param() params: ArticleTermParamsDto) {
    return this.articleTermsService.findOne(params.articleId, params.termId);
  }

  @Patch(':termId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchAdminArticleTermById',
    summary: 'Update contextual term metadata or marker value',
    description:
      'Metadata-only changes leave HTML untouched. Value or unit-type changes safely rebuild the current sentence marker in the same transaction as metadata.',
  })
  @ApiOkResponse({ type: ArticleTermUpdateSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: ArticleTermParamsDto,
    @Body() dto: UpdateArticleTermDto,
  ) {
    return this.articleTermsService.update(
      actingAdmin.id,
      params.articleId,
      params.termId,
      dto,
    );
  }

  @Delete(':termId')
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteAdminArticleTermById',
    summary: 'Delete an unused contextual term and unwrap its marker',
    description:
      'Hard deletion is rejected when vocabulary, quiz, or review history references the term. HTML unwrapping and deletion are atomic.',
  })
  @ApiNoContentResponse({ description: 'Unused term deleted.' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async delete(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: ArticleTermParamsDto,
  ): Promise<void> {
    await this.articleTermsService.delete(
      actingAdmin.id,
      params.articleId,
      params.termId,
    );
  }
}
