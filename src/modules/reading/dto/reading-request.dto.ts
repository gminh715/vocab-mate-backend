import { ApiProperty, PickType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ReadingStatus } from '../../../../generated/prisma/enums';

const isSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined;

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export enum ReadingHistorySort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
}

export class ReadingHistoryQueryDto {
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

  @ApiProperty({
    enum: ReadingStatus,
    example: ReadingStatus.READING,
    required: false,
  })
  @ValidateIf(isSupplied)
  @IsEnum(ReadingStatus)
  status?: ReadingStatus;

  @ApiProperty({
    enum: ReadingHistorySort,
    example: ReadingHistorySort.NEWEST,
    required: false,
    default: ReadingHistorySort.NEWEST,
  })
  @ValidateIf(isSupplied)
  @IsEnum(ReadingHistorySort)
  sort: ReadingHistorySort = ReadingHistorySort.NEWEST;
}

export class UpdateReadingProgressDto {
  @ApiProperty({
    example: 60,
    minimum: 0,
    maximum: 100,
    required: false,
  })
  @ValidateIf(isSupplied)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @ApiProperty({
    example: 'paragraph-3',
    minLength: 1,
    maxLength: 500,
    required: false,
    description:
      'Opaque frontend reading-position key. ReadingModule does not parse it as HTML.',
  })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  lastBlockKey?: string;
}

export class ReadingTermParamsDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  articleId!: string;

  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID()
  termId!: string;
}

export class ReadingProgressParamsDto extends PickType(ReadingTermParamsDto, [
  'articleId',
] as const) {}
