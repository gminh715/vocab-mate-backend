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
  GetVocabulariesQueryDto,
  SaveVocabularyDto,
  UpdateLearningStatusDto,
  UpdatePersonalNoteDto,
  VocabularyParamsDto,
} from '../dto/vocabulary-request.dto';
import {
  VocabularyDetailSuccessResponseDto,
  VocabularyListSuccessResponseDto,
  VocabularySaveSuccessResponseDto,
} from '../dto/vocabulary-response.dto';
import { VocabulariesService } from '../vocabularies.service';

@ApiTags('Vocabularies')
@Controller('vocabularies')
@UseInterceptors(SuccessResponseInterceptor)
@UseFilters(ApiExceptionFilter)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class VocabulariesController {
  constructor(private readonly vocabulariesService: VocabulariesService) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getVocabularies',
    summary: 'List the authenticated user saved vocabulary',
    description:
      'Returns database-paginated immutable snapshots. Search and filters never substitute current source-term metadata.',
  })
  @ApiOkResponse({ type: VocabularyListSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetVocabulariesQueryDto,
  ) {
    return this.vocabulariesService.findAll(user.id, query);
  }

  @Get(':userVocabularyId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getVocabularyById',
    summary: 'Get an owner-scoped saved vocabulary snapshot',
    description:
      'Returns snapshot learning content, an array of owner collections, and lightweight source-article navigation metadata.',
  })
  @ApiOkResponse({ type: VocabularyDetailSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description:
      'The saved vocabulary is missing or is not owned by the caller.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: VocabularyParamsDto,
  ) {
    return this.vocabulariesService.findOne(user.id, params.userVocabularyId);
  }

  @Post()
  @Version('1')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'postVocabulary',
    summary: 'Save an eligible contextual term as an immutable snapshot',
    description:
      'Requires a READY exact contextual term with complete snapshot fields, then creates a NEW immutable vocabulary snapshot and all requested owner collection memberships atomically. Later source enrichment changes do not rewrite the snapshot; scheduling fields start null.',
  })
  @ApiCreatedResponse({ type: VocabularySaveSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'Contextual lookup is disabled.',
  })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description:
      'The term is missing, inactive, stale, or not in a published article.',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The contextual term has already been saved by this user.',
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description:
      'Required snapshot content is missing or a requested collection is inaccessible.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  save(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveVocabularyDto) {
    return this.vocabulariesService.save(user.id, dto);
  }

  @Patch(':userVocabularyId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchVocabularyNote',
    summary: 'Update personal note of a saved vocabulary',
  })
  @ApiOkResponse({ type: VocabularyDetailSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  updateNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: VocabularyParamsDto,
    @Body() dto: UpdatePersonalNoteDto,
  ) {
    return this.vocabulariesService.updateNote(
      user.id,
      params.userVocabularyId,
      dto,
    );
  }

  @Patch(':userVocabularyId/status')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchVocabularyStatus',
    summary: 'Update learning status of a saved vocabulary',
  })
  @ApiOkResponse({ type: VocabularyDetailSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: VocabularyParamsDto,
    @Body() dto: UpdateLearningStatusDto,
  ) {
    return this.vocabulariesService.updateStatus(
      user.id,
      params.userVocabularyId,
      dto,
    );
  }

  @Delete(':userVocabularyId')
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteVocabulary',
    summary: 'Delete a saved vocabulary snapshot',
  })
  @ApiNoContentResponse({
    description: 'Saved vocabulary deleted successfully.',
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: VocabularyParamsDto,
  ): Promise<void> {
    return this.vocabulariesService.remove(user.id, params.userVocabularyId);
  }
}
