import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ReviewSessionStatus } from '../../../../generated/prisma/enums';

const MAX_PAGE_SIZE = 100;
const MAX_ANSWER_LENGTH = 2_000;
const MAX_RESPONSE_TIME_MS = 2_147_483_647;

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class StartReviewSessionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  quizId!: string;
}

export class ReviewSessionParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sessionId!: string;
}

export class SubmitReviewAnswerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  quizQuestionId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  selectedOptionId?: string;

  @ApiPropertyOptional({ maxLength: MAX_ANSWER_LENGTH })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ANSWER_LENGTH)
  userAnswerText?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_RESPONSE_TIME_MS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_RESPONSE_TIME_MS)
  responseTimeMs?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Compatibility field; this MVP accepts only the value 1.',
  })
  @IsOptional()
  @IsInt()
  @Equals(1)
  attemptNumber?: number;
}

export class GetReviewHistoryQueryDto {
  @ApiProperty({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiProperty({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit = 20;

  @ApiPropertyOptional({ enum: ReviewSessionStatus })
  @IsOptional()
  @IsEnum(ReviewSessionStatus)
  status?: ReviewSessionStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  articleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  quizId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/u, {
    message: 'from must include a UTC offset',
  })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/u, {
    message: 'to must include a UTC offset',
  })
  to?: string;
}

export class GetDueReviewsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit = 10;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  articleId?: string;
}
