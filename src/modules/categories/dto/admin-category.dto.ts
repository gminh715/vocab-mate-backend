import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  transformCategorySlug,
  transformTrimmedCategoryString,
} from './get-categories-query.dto';

const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 320;
const MAX_NAME_LENGTH = 100;
const MAX_SLUG_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_POSTGRES_INTEGER = 2_147_483_647;

const isSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined;

const transformBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class AdminCategoryListQueryDto {
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

  @ApiPropertyOptional({ type: Boolean, example: true })
  @ValidateIf(isSupplied)
  @Transform(transformBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class AdminCategoryParamsDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  categoryId!: string;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Technology', maxLength: MAX_NAME_LENGTH })
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @ApiProperty({
    example: 'technology',
    maxLength: MAX_SLUG_LENGTH,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @Transform(transformCategorySlug)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SLUG_LENGTH)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiPropertyOptional({
    example: 'Technology articles',
    maxLength: MAX_DESCRIPTION_LENGTH,
  })
  @ValidateIf(isSupplied)
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  @ApiPropertyOptional({ default: true, example: true })
  @ValidateIf(isSupplied)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    default: 0,
    example: 1,
    minimum: 0,
    maximum: MAX_POSTGRES_INTEGER,
  })
  @ValidateIf(isSupplied)
  @IsInt()
  @Min(0)
  @Max(MAX_POSTGRES_INTEGER)
  displayOrder?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Technology', maxLength: MAX_NAME_LENGTH })
  @ValidateIf(isSupplied)
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    example: 'technology',
    maxLength: MAX_SLUG_LENGTH,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @ValidateIf(isSupplied)
  @Transform(transformCategorySlug)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SLUG_LENGTH)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @ApiPropertyOptional({
    example: 'Updated description',
    maxLength: MAX_DESCRIPTION_LENGTH,
  })
  @ValidateIf(isSupplied)
  @Transform(transformTrimmedCategoryString)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  @ApiPropertyOptional({
    example: 2,
    minimum: 0,
    maximum: MAX_POSTGRES_INTEGER,
  })
  @ValidateIf(isSupplied)
  @IsInt()
  @Min(0)
  @Max(MAX_POSTGRES_INTEGER)
  displayOrder?: number;
}

export class UpdateCategoryStatusDto {
  @ApiProperty({ example: false })
  @IsDefined()
  @IsBoolean()
  isActive!: boolean;
}
