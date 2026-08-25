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
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums';
import { responseDataWithMeta } from '../../../common/interceptors/success-response.interceptor';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CategoriesService } from '../categories.service';
import {
  AdminCategoryListQueryDto,
  AdminCategoryParamsDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from '../dto/admin-category.dto';
import {
  AdminCategoryDetailSuccessResponseDto,
  AdminCategoryListSuccessResponseDto,
  CategoryMutationSuccessResponseDto,
  CategoryStatusSuccessResponseDto,
} from '../dto/category-response.dto';

@ApiTags('Admin Categories')
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminCategories',
    summary: 'List all categories',
    description:
      'ADMIN-only paginated category list including active and inactive categories.',
  })
  @ApiOkResponse({
    type: AdminCategoryListSuccessResponseDto,
    example: {
      success: true,
      data: { items: [] },
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    },
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async findAll(@Query() query: AdminCategoryListQueryDto) {
    const { items, meta } = await this.categoriesService.findAllAdmin(query);
    return responseDataWithMeta({ items }, meta);
  }

  @Get(':categoryId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminCategoriesByCategoryId',
    summary: 'Get category details and article count',
    description:
      'ADMIN-only detail using an aggregate article count without loading article records.',
  })
  @ApiOkResponse({
    type: AdminCategoryDetailSuccessResponseDto,
    example: {
      success: true,
      data: {
        category: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Technology',
          slug: 'technology',
          description: 'Technology articles',
          isActive: true,
          displayOrder: 1,
          createdAt: '2026-07-22T10:00:00Z',
          updatedAt: '2026-07-22T10:00:00Z',
        },
        articleCount: 12,
      },
    },
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findOne(@Param() params: AdminCategoryParamsDto) {
    return this.categoriesService.findOneAdmin(params.categoryId);
  }

  @Post()
  @Version('1')
  @ApiOperation({
    operationId: 'postAdminCategories',
    summary: 'Create a category',
    description:
      'ADMIN-only category creation. Audit identities come from the verified JWT.',
  })
  @ApiCreatedResponse({ type: CategoryMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  create(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(actingAdmin.id, dto);
  }

  @Patch(':categoryId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchAdminCategoriesByCategoryId',
    summary: 'Update a category',
    description:
      'ADMIN-only partial update. Category activation is intentionally excluded.',
  })
  @ApiOkResponse({ type: CategoryMutationSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminCategoryParamsDto,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(
      actingAdmin.id,
      params.categoryId,
      dto,
    );
  }

  @Patch(':categoryId/status')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchAdminCategoriesByCategoryIdStatus',
    summary: 'Activate or deactivate a category',
    description:
      'ADMIN-only idempotent status update. Deactivation preserves article relationships while hiding the category from public category APIs.',
  })
  @ApiOkResponse({
    type: CategoryStatusSuccessResponseDto,
    example: {
      success: true,
      data: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        isActive: false,
      },
    },
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  updateStatus(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminCategoryParamsDto,
    @Body() dto: UpdateCategoryStatusDto,
  ) {
    return this.categoriesService.updateStatus(
      actingAdmin.id,
      params.categoryId,
      dto,
    );
  }

  @Delete(':categoryId')
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteAdminCategoriesByCategoryId',
    summary: 'Delete an unused category',
    description:
      'ADMIN-only deletion. Categories referenced by articles cannot be deleted; deactivate them instead.',
  })
  @ApiNoContentResponse({ description: 'Category deleted successfully.' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description:
      'The category is referenced by articles and should be deactivated instead.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async delete(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminCategoryParamsDto,
  ): Promise<void> {
    await this.categoriesService.delete(actingAdmin.id, params.categoryId);
  }
}
