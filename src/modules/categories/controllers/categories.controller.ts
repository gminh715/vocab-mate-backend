import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseFilters,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiExceptionFilter } from '../../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../../common/interceptors/success-response.interceptor';
import { ApiErrorResponseDto } from '../../auth/dto/auth-response.dto';
import { CategoriesService } from '../categories.service';
import {
  CategorySlugParamsDto,
  GetCategoriesQueryDto,
} from '../dto/get-categories-query.dto';
import {
  CategoryDetailSuccessResponseDto,
  CategoryListSuccessResponseDto,
} from '../dto/category-response.dto';

@ApiTags('Categories')
@Controller('categories')
@UseInterceptors(SuccessResponseInterceptor)
@UseFilters(ApiExceptionFilter)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getCategories',
    summary: 'Get the list of active categories',
    description:
      'Public endpoint. Returns active categories ordered by display order, name, and ID.',
  })
  @ApiOkResponse({
    type: CategoryListSuccessResponseDto,
    example: { success: true, data: { items: [] } },
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findAll(@Query() query: GetCategoriesQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @Get(':slug')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getCategoriesBySlug',
    summary: 'Get one active category by slug',
    description:
      'Public endpoint. Inactive and unknown categories return the same not-found response.',
  })
  @ApiOkResponse({
    type: CategoryDetailSuccessResponseDto,
    example: {
      success: true,
      data: {
        category: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Technology',
          slug: 'technology',
        },
      },
    },
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findOne(@Param() params: CategorySlugParamsDto) {
    return this.categoriesService.findOneBySlug(params.slug);
  }
}
