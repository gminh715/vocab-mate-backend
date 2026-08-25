import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
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
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import {
  ArticleDetailSuccessResponseDto,
  ArticleListSuccessResponseDto,
} from '../dto/article-response.dto';
import {
  ArticleSlugParamsDto,
  GetArticlesQueryDto,
} from '../dto/get-articles-query.dto';
import { ArticlesService } from '../services/articles.service';

@ApiTags('Articles')
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getArticles',
    summary: 'Get published articles',
    description:
      'Public endpoint. Search, filters, pagination, and stable sorting are applied in PostgreSQL. Article content HTML is never returned.',
  })
  @ApiOkResponse({
    type: ArticleListSuccessResponseDto,
    example: {
      success: true,
      data: {
        items: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    },
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findAll(@Query() query: GetArticlesQueryDto) {
    return this.articlesService.findAll(query);
  }

  @Get(':slug')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getArticlesBySlug',
    summary: 'Get published article metadata',
    description:
      'Public endpoint. Unknown, draft, and archived slugs return the same not-found response. Reader content belongs to ReadingModule and is not returned.',
  })
  @ApiOkResponse({
    type: ArticleDetailSuccessResponseDto,
    example: {
      success: true,
      data: {
        article: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'How Technology Changes Learning',
          slug: 'how-technology-changes-learning',
          summary: 'A concise introduction to technology in learning.',
          sourceName: 'Vocab Mate News',
          sourceUrl: 'https://example.com/original',
          authorName: 'Jane Doe',
          thumbnailUrl: null,
          cefrLevel: 'B1',
          status: 'PUBLISHED',
          publishedAt: '2026-07-22T10:00:00Z',
        },
        category: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Technology',
          slug: 'technology',
        },
        quizCount: 2,
      },
    },
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findOne(@Param() params: ArticleSlugParamsDto) {
    return this.articlesService.findOneBySlug(params.slug);
  }
}
