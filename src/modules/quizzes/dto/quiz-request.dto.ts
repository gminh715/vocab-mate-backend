import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
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
import { QuizStatus } from '../../../../generated/prisma/enums';

const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 320;
const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 2_000;

const isSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined;

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class GetQuizzesQueryDto {
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

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(isSupplied)
  @IsUUID()
  articleId?: string;

  @ApiPropertyOptional({ example: 'technology', maxLength: MAX_SEARCH_LENGTH })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SEARCH_LENGTH)
  q?: string;
}

export class GetAdminQuizzesQueryDto extends GetQuizzesQueryDto {
  @ApiPropertyOptional({ enum: QuizStatus, example: QuizStatus.DRAFT })
  @ValidateIf(isSupplied)
  @IsEnum(QuizStatus)
  status?: QuizStatus;
}

export class QuizParamsDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  quizId!: string;
}

export class CreateQuizDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  articleId!: string;

  @ApiProperty({ example: 'Technology Vocabulary Review' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TITLE_LENGTH)
  title!: string;

  @ApiPropertyOptional({
    example: 'Review key vocabulary from the article.',
    maxLength: MAX_DESCRIPTION_LENGTH,
  })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;
}

export class UpdateQuizDto {
  @ApiPropertyOptional({ example: 'Updated Technology Vocabulary Review' })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;

  @ApiPropertyOptional({
    example: 'Updated review description.',
    maxLength: MAX_DESCRIPTION_LENGTH,
  })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;
}
