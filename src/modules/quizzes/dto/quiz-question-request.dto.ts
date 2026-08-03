import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { QuestionType } from '../../../../generated/prisma/enums';
import { QuizParamsDto } from './quiz-request.dto';

const MAX_POSTGRES_INTEGER = 2_147_483_647;
const isSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined;
const isNonNull = (_object: object, value: unknown): boolean =>
  value !== undefined && value !== null;
const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class QuestionParamsDto extends QuizParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  questionId!: string;
}

export class OptionParamsDto extends QuestionParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  optionId!: string;
}

export class CreateQuizQuestionDto {
  @ApiProperty({
    format: 'uuid',
    description: 'ID from article_sentence_terms, not user_vocabularies.',
  })
  @IsUUID()
  articleSentenceTermId!: string;

  @ApiProperty({ enum: QuestionType })
  @IsEnum(QuestionType)
  questionType!: QuestionType;

  @ApiProperty({ example: 'Choose the correct contextual meaning.' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  prompt!: string;

  @ApiPropertyOptional({ nullable: true, example: 'The lesson was ___. ' })
  @ValidateIf(isNonNull)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  blankSentence?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'engaging' })
  @ValidateIf(isNonNull)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  correctAnswerText?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(isNonNull)
  @Transform(trimString)
  @IsString()
  answerExplanation?: string | null;

  @ApiPropertyOptional({ default: false })
  @ValidateIf(isSupplied)
  @IsBoolean()
  isCaseSensitive?: boolean;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: MAX_POSTGRES_INTEGER,
  })
  @ValidateIf(isSupplied)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INTEGER)
  points?: number;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: MAX_POSTGRES_INTEGER,
  })
  @ValidateIf(isSupplied)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INTEGER)
  displayOrder?: number;

  @ApiPropertyOptional({ default: true })
  @ValidateIf(isSupplied)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateQuizQuestionDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'ID from article_sentence_terms, not user_vocabularies.',
  })
  @ValidateIf(isSupplied)
  @IsUUID()
  articleSentenceTermId?: string;

  @ApiPropertyOptional({ enum: QuestionType })
  @ValidateIf(isSupplied)
  @IsEnum(QuestionType)
  questionType?: QuestionType;

  @ApiPropertyOptional()
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  prompt?: string;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(isNonNull)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  blankSentence?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(isNonNull)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  correctAnswerText?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(isNonNull)
  @Transform(trimString)
  @IsString()
  answerExplanation?: string | null;

  @ApiPropertyOptional()
  @ValidateIf(isSupplied)
  @IsBoolean()
  isCaseSensitive?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_POSTGRES_INTEGER })
  @ValidateIf(isSupplied)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INTEGER)
  points?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_POSTGRES_INTEGER })
  @ValidateIf(isSupplied)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INTEGER)
  displayOrder?: number;

  @ApiPropertyOptional()
  @ValidateIf(isSupplied)
  @IsBoolean()
  isActive?: boolean;
}

export class CreateQuestionOptionDto {
  @ApiProperty({ example: 'A highly interesting experience' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  optionText!: string;

  @ApiPropertyOptional({ default: false })
  @ValidateIf(isSupplied)
  @IsBoolean()
  isCorrect?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(isNonNull)
  @Transform(trimString)
  @IsString()
  explanation?: string | null;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: MAX_POSTGRES_INTEGER,
  })
  @ValidateIf(isSupplied)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INTEGER)
  displayOrder?: number;
}

export class UpdateQuestionOptionDto {
  @ApiPropertyOptional()
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  optionText?: string;

  @ApiPropertyOptional()
  @ValidateIf(isSupplied)
  @IsBoolean()
  isCorrect?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(isNonNull)
  @Transform(trimString)
  @IsString()
  explanation?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_POSTGRES_INTEGER })
  @ValidateIf(isSupplied)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INTEGER)
  displayOrder?: number;
}
