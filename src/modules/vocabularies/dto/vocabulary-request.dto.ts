import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CefrLevel } from '../../../../generated/prisma/enums';

const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 320;
const MAX_COLLECTION_IDS = 50;

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const trimStringArray = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? (value as unknown[]).map((item) =>
        typeof item === 'string' ? item.trim() : item,
      )
    : value;

export enum VocabularySort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
}

export class GetVocabulariesQueryDto {
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
      'Searches saved word, lemma, and contextual meaning snapshots.',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SEARCH_LENGTH)
  q?: string;

  @ApiPropertyOptional({ enum: CefrLevel })
  @IsOptional()
  @IsEnum(CefrLevel)
  cefrLevel?: CefrLevel;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  collectionId?: string;

  @ApiPropertyOptional({
    enum: VocabularySort,
    default: VocabularySort.NEWEST,
  })
  @IsOptional()
  @IsEnum(VocabularySort)
  sort: VocabularySort = VocabularySort.NEWEST;
}

export class VocabularyParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userVocabularyId!: string;
}

export class SaveVocabularyDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID()
  articleSentenceTermId!: string;

  @ApiProperty({
    type: [String],
    items: { type: 'string', format: 'uuid' },
    minItems: 1,
    maxItems: MAX_COLLECTION_IDS,
    example: [
      '550e8400-e29b-41d4-a716-446655440010',
      '550e8400-e29b-41d4-a716-446655440011',
    ],
  })
  @Transform(trimStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_COLLECTION_IDS)
  @IsUUID(undefined, { each: true })
  collectionIds!: string[];
}
