import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  AiGenerationStatus,
  CefrLevel,
  LexicalUnitType,
  TermOrigin,
  TermReviewStatus,
} from '../../../../generated/prisma/enums';
import { PaginationMetaDto } from '../../users/dto/admin-response.dto';

const MAX_PAGE_SIZE = 100;
const MAX_METADATA_LENGTH = 20_000;
const MAX_SKILL_LENGTH = 300;
const isSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined;
const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const parseBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class ParseArticleContentDto {
  @ApiPropertyOptional({ default: false })
  @ValidateIf(isSupplied)
  @IsBoolean()
  force?: boolean;
}

export class ArticleSentenceListQueryDto {
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

  @ApiPropertyOptional({ example: true })
  @ValidateIf(isSupplied)
  @Transform(parseBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class ArticleSentenceParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  articleId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sentenceId!: string;
}

export class UpdateArticleSentenceDto {
  @ApiPropertyOptional({ example: 'Bản dịch tiếng Việt.' })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_METADATA_LENGTH)
  translationVi?: string;

  @ApiPropertyOptional({ example: 'Giải thích cấu trúc câu.' })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_METADATA_LENGTH)
  explanationVi?: string;

  @ApiPropertyOptional({ example: 'The pronoun refers to the previous noun.' })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_METADATA_LENGTH)
  referenceExplanation?: string;

  @ApiPropertyOptional({ example: 'reading-comprehension' })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SKILL_LENGTH)
  skill?: string;

  @ApiPropertyOptional({ example: true })
  @ValidateIf(isSupplied)
  @IsBoolean()
  isActive?: boolean;
}

export class ArticleSentenceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  articleId!: string;

  @ApiProperty({ minimum: 1 })
  contentVersion!: number;

  @ApiProperty({ minimum: 1 })
  sentenceOrder!: number;

  @ApiProperty({ example: 'Technology changes how students learn.' })
  sentenceText!: string;

  @ApiProperty({ nullable: true })
  translationVi!: string | null;

  @ApiProperty({ nullable: true })
  explanationVi!: string | null;

  @ApiProperty({ nullable: true })
  referenceExplanation!: string | null;

  @ApiProperty({ nullable: true })
  skill!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class ArticleSentenceTermDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sentenceId!: string;

  @ApiProperty()
  value!: string;

  @ApiProperty()
  wordDisplay!: string;

  @ApiProperty()
  lemma!: string;

  @ApiProperty()
  normalizedLemma!: string;

  @ApiProperty({ enum: LexicalUnitType })
  unitType!: LexicalUnitType;

  @ApiProperty()
  partOfSpeech!: string;

  @ApiProperty({ nullable: true })
  ipa!: string | null;

  @ApiProperty({ enum: CefrLevel })
  cefrLevel!: CefrLevel;

  @ApiProperty({ nullable: true })
  contextualMeaningVi!: string | null;

  @ApiProperty({ nullable: true })
  definitionEn!: string | null;

  @ApiProperty({ nullable: true })
  contextualExplanation!: string | null;

  @ApiProperty({ type: [String] })
  synonyms!: string[];

  @ApiProperty({ type: [String] })
  antonyms!: string[];

  @ApiProperty({ type: [String] })
  collocations!: string[];

  @ApiProperty({ type: [String] })
  relatedTerms!: string[];

  @ApiProperty({ nullable: true })
  vocabularyTopic!: string | null;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  examples!: unknown[];

  @ApiProperty({ nullable: true })
  skill!: string | null;

  @ApiProperty({ enum: TermOrigin, example: TermOrigin.MANUAL })
  origin!: TermOrigin;

  @ApiProperty({
    enum: TermReviewStatus,
    example: TermReviewStatus.APPROVED,
  })
  reviewStatus!: TermReviewStatus;

  @ApiProperty({ nullable: true })
  selectionReason!: string | null;

  @ApiProperty({
    enum: AiGenerationStatus,
    example: AiGenerationStatus.READY,
  })
  explanationStatus!: AiGenerationStatus;

  @ApiProperty({ nullable: true })
  explanationError!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  explanationGeneratedAt!: Date | null;

  @ApiProperty()
  isLookupEnabled!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class ParseArticleContentDataDto {
  @ApiProperty({ minimum: 1 })
  contentVersion!: number;

  @ApiProperty({ minimum: 1 })
  sentenceCount!: number;

  @ApiProperty()
  contentHtml!: string;
}

export class ParseArticleContentSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ParseArticleContentDataDto })
  data!: ParseArticleContentDataDto;
}

export class ArticleSentenceListDataDto {
  @ApiProperty({ type: [ArticleSentenceDto] })
  items!: ArticleSentenceDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;

  @ApiProperty({ minimum: 1 })
  contentVersion!: number;
}

export class ArticleSentenceListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleSentenceListDataDto })
  data!: ArticleSentenceListDataDto;
}

export class ArticleSentenceDetailDataDto {
  @ApiProperty({ type: ArticleSentenceDto })
  sentence!: ArticleSentenceDto;

  @ApiProperty({ type: [ArticleSentenceTermDto] })
  terms!: ArticleSentenceTermDto[];
}

export class ArticleSentenceDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleSentenceDetailDataDto })
  data!: ArticleSentenceDetailDataDto;
}

export class ArticleSentenceMutationDataDto {
  @ApiProperty({ type: ArticleSentenceDto })
  sentence!: ArticleSentenceDto;
}

export class ArticleSentenceMutationSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleSentenceMutationDataDto })
  data!: ArticleSentenceMutationDataDto;
}
