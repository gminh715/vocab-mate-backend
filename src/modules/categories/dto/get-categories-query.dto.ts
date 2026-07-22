import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const normalizeCategorySlug = (value: string): string =>
  value.trim().toLowerCase();

export const transformTrimmedCategoryString = ({
  value,
}: {
  value: unknown;
}): unknown => (typeof value === 'string' ? value.trim() : value);

export const transformCategorySlug = ({
  value,
}: {
  value: unknown;
}): unknown =>
  typeof value === 'string' ? normalizeCategorySlug(value) : value;

export class GetCategoriesQueryDto {
  @ApiPropertyOptional({
    example: 'technology',
    minLength: 1,
    maxLength: 320,
    description: 'Case-insensitive search by category name.',
  })
  @IsOptional()
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  q?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Reserved by the API contract. Omit this parameter until supported enum values are documented.',
  })
  @IsOptional()
  @IsIn([], {
    message: 'sort is not supported because no enum values are documented',
  })
  sort?: string;
}

export class CategorySlugParamsDto {
  @ApiProperty({ example: 'technology', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' })
  @Transform(transformCategorySlug)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}
