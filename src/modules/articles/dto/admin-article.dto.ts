import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ArticleStatus, CefrLevel } from '../../../../generated/prisma/enums';
import {
  transformCategorySlug,
  transformTrimmedCategoryString,
} from '../../categories/dto/get-categories-query.dto';
import { ArticleSort } from './get-articles-query.dto';

const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 320;
const MAX_TITLE_LENGTH = 300;
const MAX_SLUG_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_CONTENT_LENGTH = 1_000_000;
const MAX_NAME_LENGTH = 300;
const MAX_URL_LENGTH = 2_048;

const isSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined;

const optionalUrlOptions = {
  protocols: ['http', 'https'],
  require_protocol: true,
};

export class AdminArticleListQueryDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number;

  @ApiProperty({ example: 20, minimum: 1, maximum: MAX_PAGE_SIZE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit!: number;

  @ApiPropertyOptional({ example: 'technology', maxLength: MAX_SEARCH_LENGTH })
  @ValidateIf(isSupplied)
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SEARCH_LENGTH)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(isSupplied)
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: CefrLevel, example: CefrLevel.B1 })
  @ValidateIf(isSupplied)
  @IsEnum(CefrLevel)
  cefrLevel?: CefrLevel;

  @ApiPropertyOptional({ enum: ArticleStatus, example: ArticleStatus.DRAFT })
  @ValidateIf(isSupplied)
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @ApiPropertyOptional({
    enum: ArticleSort,
    default: ArticleSort.NEWEST,
  })
  @ValidateIf(isSupplied)
  @IsEnum(ArticleSort)
  sort?: ArticleSort;
}

export class AdminArticleParamsDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  articleId!: string;
}

export class CreateArticleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 'How Technology Changes Learning' })
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TITLE_LENGTH)
  title!: string;

  @ApiProperty({
    example: 'how-technology-changes-learning',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @Transform(transformCategorySlug)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SLUG_LENGTH)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty({ example: 'A concise introduction to technology in learning.' })
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SUMMARY_LENGTH)
  summary!: string;

  @ApiProperty({ example: '<p>Article content</p>' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CONTENT_LENGTH)
  contentHtml!: string;

  @ApiProperty({ enum: CefrLevel, example: CefrLevel.B1 })
  @IsEnum(CefrLevel)
  cefrLevel!: CefrLevel;

  @ApiPropertyOptional({ example: 'Vocab Mate News' })
  @ValidateIf(isSupplied)
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MaxLength(MAX_NAME_LENGTH)
  sourceName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/source' })
  @ValidateIf(isSupplied)
  @IsUrl(optionalUrlOptions)
  @MaxLength(MAX_URL_LENGTH)
  sourceUrl?: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @ValidateIf(isSupplied)
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MaxLength(MAX_NAME_LENGTH)
  authorName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/article.jpg' })
  @ValidateIf(isSupplied)
  @IsUrl(optionalUrlOptions)
  @MaxLength(MAX_URL_LENGTH)
  thumbnailUrl?: string;
}

export class UpdateArticleDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(isSupplied)
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'How Technology Changes Learning' })
  @ValidateIf(isSupplied)
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;

  @ApiPropertyOptional({
    example: 'how-technology-changes-learning',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @ValidateIf(isSupplied)
  @Transform(transformCategorySlug)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SLUG_LENGTH)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @ApiPropertyOptional({ example: 'Updated summary' })
  @ValidateIf(isSupplied)
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SUMMARY_LENGTH)
  summary?: string;

  @ApiPropertyOptional({ example: '<p>Updated article content</p>' })
  @ValidateIf(isSupplied)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CONTENT_LENGTH)
  contentHtml?: string;

  @ApiPropertyOptional({ enum: CefrLevel, example: CefrLevel.B2 })
  @ValidateIf(isSupplied)
  @IsEnum(CefrLevel)
  cefrLevel?: CefrLevel;

  @ApiPropertyOptional({ example: 'Vocab Mate News' })
  @ValidateIf(isSupplied)
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MaxLength(MAX_NAME_LENGTH)
  sourceName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/source' })
  @ValidateIf(isSupplied)
  @IsUrl(optionalUrlOptions)
  @MaxLength(MAX_URL_LENGTH)
  sourceUrl?: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @ValidateIf(isSupplied)
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MaxLength(MAX_NAME_LENGTH)
  authorName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/article.jpg' })
  @ValidateIf(isSupplied)
  @IsUrl(optionalUrlOptions)
  @MaxLength(MAX_URL_LENGTH)
  thumbnailUrl?: string;
}
