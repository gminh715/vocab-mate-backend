import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { LearningStatus } from '../../../../generated/prisma/enums';

const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 320;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_COLLECTION_ITEM_BATCH_SIZE = 50;

const isSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined;

const isNonNullSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined && value !== null;

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const trimStringArray = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? (value as unknown[]).map((item) =>
        typeof item === 'string' ? item.trim() : item,
      )
    : value;

export enum CollectionItemSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
}

export class GetCollectionsQueryDto {
  @ApiPropertyOptional({ default: 1, example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    default: 20,
    example: 20,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit = 20;

  @ApiPropertyOptional({
    example: 'technology',
    maxLength: MAX_SEARCH_LENGTH,
    description: 'Searches collection name.',
  })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SEARCH_LENGTH)
  q?: string;
}

export class CollectionParamsDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440010',
  })
  @IsUUID()
  collectionId!: string;
}

export class CollectionItemParamsDto extends CollectionParamsDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440020',
  })
  @IsUUID()
  userVocabularyId!: string;
}

export class GetCollectionItemsQueryDto {
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

  @ApiPropertyOptional({
    example: 'harmful',
    maxLength: MAX_SEARCH_LENGTH,
    description:
      'Searches saved word, lemma, contextual meaning, and personal note snapshots.',
  })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SEARCH_LENGTH)
  q?: string;

  @ApiPropertyOptional({ enum: LearningStatus })
  @ValidateIf(isSupplied)
  @IsEnum(LearningStatus)
  learningStatus?: LearningStatus;

  @ApiPropertyOptional({
    enum: CollectionItemSort,
    default: CollectionItemSort.NEWEST,
  })
  @ValidateIf(isSupplied)
  @IsEnum(CollectionItemSort)
  sort: CollectionItemSort = CollectionItemSort.NEWEST;
}

export class AddCollectionItemsDto {
  @ApiProperty({
    type: [String],
    items: { type: 'string', format: 'uuid' },
    minItems: 1,
    maxItems: MAX_COLLECTION_ITEM_BATCH_SIZE,
    example: [
      '550e8400-e29b-41d4-a716-446655440020',
      '550e8400-e29b-41d4-a716-446655440021',
    ],
  })
  @Transform(trimStringArray)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_COLLECTION_ITEM_BATCH_SIZE)
  @IsUUID(undefined, { each: true })
  userVocabularyIds!: string[];
}

export class CreateCollectionDto {
  @ApiProperty({ example: 'Technology', maxLength: MAX_NAME_LENGTH })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @ApiPropertyOptional({
    example: 'Words about software and computing.',
    maxLength: MAX_DESCRIPTION_LENGTH,
  })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;
}

export class UpdateCollectionDto {
  @ApiPropertyOptional({ example: 'Advanced Technology', maxLength: 100 })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    example: 'Updated description.',
    nullable: true,
    maxLength: MAX_DESCRIPTION_LENGTH,
    description: 'Set to null to clear the description.',
  })
  @ValidateIf(isNonNullSupplied)
  @Transform(trimString)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string | null;
}
