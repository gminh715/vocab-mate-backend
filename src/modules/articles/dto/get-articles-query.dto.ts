import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CefrLevel } from '../../../../generated/prisma/enums';
import {
  transformCategorySlug,
  transformTrimmedCategoryString,
} from '../../categories/dto/get-categories-query.dto';

export enum ArticleSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
}

export class GetArticlesQueryDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number;

  @ApiProperty({ example: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit!: number;

  @ApiPropertyOptional({
    example: 'technology',
    minLength: 1,
    maxLength: 320,
    description: 'Case-insensitive search in article titles and summaries.',
  })
  @IsOptional()
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  q?: string;

  @ApiPropertyOptional({
    example: 'technology',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @IsOptional()
  @Transform(transformCategorySlug)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  categorySlug?: string;

  @ApiPropertyOptional({ enum: CefrLevel, example: CefrLevel.B1 })
  @IsOptional()
  @IsEnum(CefrLevel)
  cefrLevel?: CefrLevel;

  @ApiProperty({ enum: ArticleSort, example: ArticleSort.NEWEST })
  @IsEnum(ArticleSort)
  sort!: ArticleSort;
}

export class ArticleSlugParamsDto {
  @ApiProperty({
    example: 'how-technology-changes-learning',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @Transform(transformCategorySlug)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}
