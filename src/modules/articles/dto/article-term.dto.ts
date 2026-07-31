import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  AiGenerationStatus,
  CefrLevel,
  LexicalUnitType,
  TermOrigin,
  TermReviewStatus,
} from '../../../../generated/prisma/enums';
import { PaginationMetaDto } from '../../users/dto/admin-response.dto';
import {
  ArticleSentenceDto,
  ArticleSentenceTermDto,
} from './article-sentence.dto';

const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 320;
const MAX_TERM_LENGTH = 500;
const MAX_METADATA_LENGTH = 20_000;
const MAX_ARRAY_ITEMS = 100;
const MAX_EXAMPLES = 50;
const isSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined;
const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const trimStringArray = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? (value as unknown[]).map((item) =>
        typeof item === 'string' ? item.trim() : item,
      )
    : value;
const parseBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class ArticleTermParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  articleId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  termId!: string;
}

export class ArticleTermExampleDto {
  @ApiProperty({ example: 'Digital tools improve access to education.' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  sentence!: string;

  @ApiProperty({ example: 'Công cụ số cải thiện khả năng tiếp cận giáo dục.' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  translationVi!: string;
}

export class CreateArticleTermDto {
  @ApiProperty({ example: 'digital tools' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TERM_LENGTH)
  value!: string;

  @ApiProperty({ example: 'digital tools' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TERM_LENGTH)
  wordDisplay!: string;

  @ApiProperty({ example: 'digital tool' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TERM_LENGTH)
  lemma!: string;

  @ApiProperty({ example: 'digital tool' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TERM_LENGTH)
  normalizedLemma!: string;

  @ApiProperty({ enum: LexicalUnitType, example: LexicalUnitType.PHRASE })
  @IsEnum(LexicalUnitType)
  unitType!: LexicalUnitType;

  @ApiProperty({ example: 'noun phrase' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TERM_LENGTH)
  partOfSpeech!: string;

  @ApiPropertyOptional({ example: '/ˈdɪdʒɪtl tuːlz/' })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TERM_LENGTH)
  ipa?: string;

  @ApiProperty({ enum: CefrLevel, example: CefrLevel.B1 })
  @IsEnum(CefrLevel)
  cefrLevel!: CefrLevel;

  @ApiProperty({ example: 'công cụ số' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_METADATA_LENGTH)
  contextualMeaningVi!: string;

  @ApiPropertyOptional({ example: 'Electronic resources used for a task.' })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_METADATA_LENGTH)
  definitionEn?: string;

  @ApiPropertyOptional({ example: 'This phrase is the subject of the clause.' })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_METADATA_LENGTH)
  contextualExplanation?: string;

  @ApiPropertyOptional({ type: [String], default: [] })
  @ValidateIf(isSupplied)
  @Transform(trimStringArray)
  @IsArray()
  @ArrayMaxSize(MAX_ARRAY_ITEMS)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(MAX_TERM_LENGTH, { each: true })
  synonyms?: string[];

  @ApiPropertyOptional({ type: [String], default: [] })
  @ValidateIf(isSupplied)
  @Transform(trimStringArray)
  @IsArray()
  @ArrayMaxSize(MAX_ARRAY_ITEMS)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(MAX_TERM_LENGTH, { each: true })
  antonyms?: string[];

  @ApiPropertyOptional({ type: [String], default: [] })
  @ValidateIf(isSupplied)
  @Transform(trimStringArray)
  @IsArray()
  @ArrayMaxSize(MAX_ARRAY_ITEMS)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(MAX_TERM_LENGTH, { each: true })
  collocations?: string[];

  @ApiPropertyOptional({ type: [String], default: [] })
  @ValidateIf(isSupplied)
  @Transform(trimStringArray)
  @IsArray()
  @ArrayMaxSize(MAX_ARRAY_ITEMS)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(MAX_TERM_LENGTH, { each: true })
  relatedTerms?: string[];

  @ApiPropertyOptional({ example: 'technology' })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TERM_LENGTH)
  vocabularyTopic?: string;

  @ApiPropertyOptional({ type: [ArticleTermExampleDto], default: [] })
  @ValidateIf(isSupplied)
  @IsArray()
  @ArrayMaxSize(MAX_EXAMPLES)
  @ValidateNested({ each: true })
  @Type(() => ArticleTermExampleDto)
  examples?: ArticleTermExampleDto[];

  @ApiPropertyOptional({ example: 'vocabulary' })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TERM_LENGTH)
  skill?: string;

  @ApiPropertyOptional({ default: true })
  @ValidateIf(isSupplied)
  @IsBoolean()
  isLookupEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @ValidateIf(isSupplied)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateArticleTermDto extends PartialType(CreateArticleTermDto) {}

export class ArticleTermListQueryDto {
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
  sentenceId?: string;

  @ApiPropertyOptional({ enum: CefrLevel })
  @ValidateIf(isSupplied)
  @IsEnum(CefrLevel)
  cefrLevel?: CefrLevel;

  @ApiPropertyOptional({ enum: LexicalUnitType })
  @ValidateIf(isSupplied)
  @IsEnum(LexicalUnitType)
  unitType?: LexicalUnitType;

  @ApiPropertyOptional({ enum: TermOrigin })
  @ValidateIf(isSupplied)
  @IsEnum(TermOrigin)
  origin?: TermOrigin;

  @ApiPropertyOptional({ enum: TermReviewStatus })
  @ValidateIf(isSupplied)
  @IsEnum(TermReviewStatus)
  reviewStatus?: TermReviewStatus;

  @ApiPropertyOptional({ enum: AiGenerationStatus })
  @ValidateIf(isSupplied)
  @IsEnum(AiGenerationStatus)
  explanationStatus?: AiGenerationStatus;

  @ApiPropertyOptional()
  @ValidateIf(isSupplied)
  @Transform(parseBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ maxLength: MAX_SEARCH_LENGTH })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SEARCH_LENGTH)
  q?: string;
}

export class ArticleTermListItemDto extends ArticleSentenceTermDto {
  @ApiProperty({ minimum: 1 })
  sentenceOrder!: number;

  @ApiProperty()
  hasDefinitionEn!: boolean;

  @ApiProperty()
  hasContextualExplanation!: boolean;

  @ApiProperty()
  hasExamples!: boolean;
}

export class ArticleTermListDataDto {
  @ApiProperty({ type: [ArticleTermListItemDto] })
  items!: ArticleTermListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;

  @ApiProperty({ minimum: 1 })
  contentVersion!: number;
}

export class ArticleTermListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleTermListDataDto })
  data!: ArticleTermListDataDto;
}

export class ArticleTermDetailDataDto {
  @ApiProperty({ type: ArticleSentenceTermDto })
  term!: ArticleSentenceTermDto;

  @ApiProperty({ type: ArticleSentenceDto })
  sentence!: ArticleSentenceDto;
}

export class ArticleTermDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleTermDetailDataDto })
  data!: ArticleTermDetailDataDto;
}

export class ArticleTermCreateDataDto {
  @ApiProperty({ type: ArticleSentenceTermDto })
  term!: ArticleSentenceTermDto;

  @ApiProperty()
  updatedContentHtml!: string;
}

export class ArticleTermCreateSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleTermCreateDataDto })
  data!: ArticleTermCreateDataDto;
}

export class ArticleTermUpdateDataDto {
  @ApiProperty({ type: ArticleSentenceTermDto })
  term!: ArticleSentenceTermDto;

  @ApiProperty()
  contentHtmlChanged!: boolean;
}

export class ArticleTermUpdateSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleTermUpdateDataDto })
  data!: ArticleTermUpdateDataDto;
}
