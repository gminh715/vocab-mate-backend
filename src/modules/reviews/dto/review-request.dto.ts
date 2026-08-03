import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsDefined,
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
  ValidateIf,
} from 'class-validator';
import {
  ReviewSessionStatus,
  ReviewSessionType,
} from '../../../../generated/prisma/enums';

const MAX_PAGE_SIZE = 100;
const MAX_ANSWER_LENGTH = 2_000;
const MAX_RESPONSE_TIME_MS = 2_147_483_647;

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class StartReviewSessionDto {
  @ApiPropertyOptional({
    enum: ReviewSessionType,
    default: ReviewSessionType.QUIZ,
    example: ReviewSessionType.DAILY_REVIEW,
    description:
      'Review source. Supply only the identifier required by the selected source type.',
  })
  @IsOptional()
  @IsEnum(ReviewSessionType)
  sessionType: ReviewSessionType = ReviewSessionType.QUIZ;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    example: null,
    description: 'Required only for a fixed QUIZ session.',
  })
  @ValidateIf(
    (dto: StartReviewSessionDto) =>
      dto.sessionType === ReviewSessionType.QUIZ || dto.quizId != null,
  )
  @IsDefined()
  @IsUUID()
  quizId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    example: null,
    description: 'Required only for ARTICLE_REVIEW.',
  })
  @ValidateIf(
    (dto: StartReviewSessionDto) =>
      dto.sessionType === ReviewSessionType.ARTICLE_REVIEW ||
      dto.articleId != null,
  )
  @IsDefined()
  @IsUUID()
  articleId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    example: null,
    description: 'Required only for COLLECTION_REVIEW.',
  })
  @ValidateIf(
    (dto: StartReviewSessionDto) =>
      dto.sessionType === ReviewSessionType.COLLECTION_REVIEW ||
      dto.collectionId != null,
  )
  @IsDefined()
  @IsUUID()
  collectionId?: string | null;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit = 20;
}

export class ReviewSessionParamsDto {
  @ApiProperty({
    format: 'uuid',
    example: '1fd83a7b-5f47-4e68-90e3-58e58d83f56d',
  })
  @IsUUID()
  sessionId!: string;
}

export class SubmitReviewAnswerDto {
  @ApiProperty({
    format: 'uuid',
    example: '2f39d6c0-a2bc-4d3f-a3ae-e5844bf16e55',
  })
  @IsUUID()
  reviewSessionItemId!: string;

  @ApiProperty({
    format: 'uuid',
    example: '3f4c24ad-0776-45e0-83d4-34b19685da06',
  })
  @IsUUID()
  quizQuestionId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '8cc0eb2c-f9d1-4d87-ab2f-13b381a13017',
    description: 'Use for a multiple-choice question.',
  })
  @IsOptional()
  @IsUUID()
  selectedOptionId?: string;

  @ApiPropertyOptional({
    maxLength: MAX_ANSWER_LENGTH,
    example: 'engaging',
    description: 'Use for a fill-in-the-blank question.',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ANSWER_LENGTH)
  userAnswerText?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_RESPONSE_TIME_MS,
    example: 4200,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_RESPONSE_TIME_MS)
  responseTimeMs?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 32_767,
    default: 0,
    example: 1,
    description: 'Number of progressive hints revealed before submission.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(32_767)
  hintsUsed?: number;
}

export class SkipReviewSessionItemDto {
  @ApiProperty({
    format: 'uuid',
    example: '2f39d6c0-a2bc-4d3f-a3ae-e5844bf16e55',
  })
  @IsUUID()
  reviewSessionItemId!: string;

  @ApiProperty({
    format: 'uuid',
    example: '3f4c24ad-0776-45e0-83d4-34b19685da06',
  })
  @IsUUID()
  quizQuestionId!: string;
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
