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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums';
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CollectionsService } from '../services/collections.service';
import {
  AddCollectionItemsDto,
  CollectionItemParamsDto,
  CollectionParamsDto,
  CreateCollectionDto,
  GetCollectionItemsQueryDto,
  GetCollectionsQueryDto,
  UpdateCollectionDto,
} from '../dto/collection-request.dto';
import {
  CollectionDetailSuccessResponseDto,
  CollectionItemsAddSuccessResponseDto,
  CollectionItemsListSuccessResponseDto,
  CollectionListSuccessResponseDto,
  CollectionMutationSuccessResponseDto,
} from '../dto/collection-response.dto';

@ApiTags('Collections')
@Controller('collections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getCollections',
    summary: 'List the authenticated user collections',
    description:
      'Returns owner-scoped collections with database-calculated vocabulary counts and deterministic pagination.',
  })
  @ApiOkResponse({ type: CollectionListSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetCollectionsQueryDto,
  ) {
    return this.collectionsService.findAll(user.id, query);
  }

  @Post()
  @Version('1')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'postCollection',
    summary: 'Create a collection for the authenticated user',
  })
  @ApiCreatedResponse({ type: CollectionMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The user already has a collection with this exact name.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCollectionDto,
  ) {
    return this.collectionsService.create(user.id, dto);
  }

  @Get(':collectionId/items')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getCollectionItems',
    summary: 'List saved vocabulary in an owner-scoped collection',
    description:
      'Returns database-paginated immutable vocabulary snapshots. Current source-term metadata is not used.',
  })
  @ApiOkResponse({ type: CollectionItemsListSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'The collection is missing or is not owned by the caller.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CollectionParamsDto,
    @Query() query: GetCollectionItemsQueryDto,
  ) {
    return this.collectionsService.findItems(
      user.id,
      params.collectionId,
      query,
    );
  }

  @Post(':collectionId/items')
  @Version('1')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'postCollectionItems',
    summary: 'Bulk add owned saved vocabulary to an owner-scoped collection',
    description:
      'Validates all unique vocabulary IDs and inserts new relations atomically. Existing and repeated relations are counted as skipped.',
  })
  @ApiCreatedResponse({ type: CollectionItemsAddSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'The collection is missing or is not owned by the caller.',
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description:
      'At least one requested saved vocabulary is missing or not owned by the caller.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  addItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CollectionParamsDto,
    @Body() dto: AddCollectionItemsDto,
  ) {
    return this.collectionsService.addItems(user.id, params.collectionId, dto);
  }

  @Delete(':collectionId/items/:userVocabularyId')
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteCollectionItem',
    summary: 'Remove one owned vocabulary relation from an owned collection',
    description:
      'Deletes only the matching membership. Saved vocabulary, review history, and other collection memberships remain.',
  })
  @ApiNoContentResponse({ description: 'Collection item removed.' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description:
      'The collection, vocabulary, or matching owner-scoped relation was not found.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  deleteItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CollectionItemParamsDto,
  ): Promise<void> {
    return this.collectionsService.deleteItem(
      user.id,
      params.collectionId,
      params.userVocabularyId,
    );
  }

  @Get(':collectionId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getCollectionById',
    summary: 'Get an owner-scoped collection and its vocabulary count',
  })
  @ApiOkResponse({ type: CollectionDetailSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'The collection is missing or is not owned by the caller.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CollectionParamsDto,
  ) {
    return this.collectionsService.findOne(user.id, params.collectionId);
  }

  @Patch(':collectionId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchCollectionById',
    summary: 'Partially update an owner-scoped collection',
  })
  @ApiOkResponse({ type: CollectionMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'The collection is missing or is not owned by the caller.',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The user already has a collection with this exact name.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CollectionParamsDto,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.collectionsService.update(user.id, params.collectionId, dto);
  }

  @Delete(':collectionId')
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteCollectionById',
    summary: 'Delete an owner-scoped collection',
    description:
      'Deletes the collection and saved vocabulary that belongs only to it. Vocabulary shared with another collection and Daily Review history remain.',
  })
  @ApiNoContentResponse({ description: 'Collection deleted successfully.' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'The collection is missing or is not owned by the caller.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CollectionParamsDto,
  ): Promise<void> {
    return this.collectionsService.delete(user.id, params.collectionId);
  }
}
