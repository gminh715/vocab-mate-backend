import { ApiProperty } from '@nestjs/swagger';
import {
  AiGenerationStatus,
  ArticleStatus,
  CefrLevel,
  ReadingStatus,
} from '../../../../generated/prisma/enums';
import { PublicCategoryDto } from '../../categories/dto/category-response.dto';
import { PublicArticleMetadataDto } from '../../articles/dto/article-response.dto';
import { PaginationMetaDto } from '../../../common/dto/pagination-meta.dto';

export class ReaderArticleDto extends PublicArticleMetadataDto {
  @ApiProperty({ type: PublicCategoryDto })
  category!: PublicCategoryDto;
}

export class ReaderProgressDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  articleId!: string;

  @ApiProperty({ enum: ReadingStatus, example: ReadingStatus.READING })
  status!: ReadingStatus;

  @ApiProperty({ example: 60, minimum: 0, maximum: 100 })
  progressPercent!: number;

  @ApiProperty({
    format: 'date-time',
    example: null,
    nullable: true,
  })
  completedAt!: Date | null;
}

export class ReadingProgressDataDto {
  @ApiProperty({ type: ReaderProgressDto })
  progress!: ReaderProgressDto;
}

export class ReadingProgressSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ReadingProgressDataDto })
  data!: ReadingProgressDataDto;
}

export class ReadingHistoryArticleDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ example: 'How Technology Changes Learning' })
  title!: string;

  @ApiProperty({ example: 'how-technology-changes-learning' })
  slug!: string;

  @ApiProperty({ example: 'A concise introduction to technology in learning.' })
  summary!: string;

  @ApiProperty({
    example: 'https://cdn.example.com/articles/technology.jpg',
    nullable: true,
  })
  thumbnailUrl!: string | null;

  @ApiProperty({ enum: CefrLevel, example: CefrLevel.B1 })
  cefrLevel!: CefrLevel;

  @ApiProperty({
    enum: ArticleStatus,
    example: ArticleStatus.ARCHIVED,
    description:
      'Historical entries remain visible if their article is later archived.',
  })
  status!: ArticleStatus;

  @ApiProperty({ format: 'date-time', nullable: true })
  publishedAt!: Date | null;

  @ApiProperty({ type: PublicCategoryDto })
  category!: PublicCategoryDto;
}

export class ReadingHistoryItemDto extends ReaderProgressDto {
  @ApiProperty({ format: 'date-time' })
  firstOpenedAt!: Date;

  @ApiProperty({ format: 'date-time' })
  lastReadAt!: Date;

  @ApiProperty({ type: ReadingHistoryArticleDto })
  article!: ReadingHistoryArticleDto;
}

export class ReadingHistoryDataDto {
  @ApiProperty({ type: [ReadingHistoryItemDto] })
  items!: ReadingHistoryItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class ReadingHistorySuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ReadingHistoryDataDto })
  data!: ReadingHistoryDataDto;
}

export class ReaderArticleDataDto {
  @ApiProperty({ type: ReaderArticleDto })
  article!: ReaderArticleDto;

  @ApiProperty({
    example:
      '<p><span data-sentence-id="...">Technology changes learning.</span></p>',
    description:
      'Sanitized, render-ready HTML for the published current content version.',
  })
  contentHtml!: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'uuid' },
    example: [
      '550e8400-e29b-41d4-a716-446655440002',
      '550e8400-e29b-41d4-a716-446655440003',
    ],
    description:
      'IDs of active current-version lookup terms above the authenticated user current CEFR level and at or below their target CEFR level.',
  })
  highlightedTermIds!: string[];

  @ApiProperty({
    type: ReaderProgressDto,
    description:
      'Existing user progress, or a non-persisted READING/0% default. This GET never creates or updates progress.',
  })
  progress!: ReaderProgressDto;
}

export class ReaderArticleSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ReaderArticleDataDto })
  data!: ReaderArticleDataDto;
}

export class ContextualTermDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  id!: string;

  @ApiProperty({ example: 'harmful' })
  value!: string;

  @ApiProperty({ example: 'harmful' })
  lemma!: string;

  @ApiProperty({ example: 'adjective' })
  partOfSpeech!: string;

  @ApiProperty({ example: '/ˈhɑːrmfəl/', nullable: true })
  ipa!: string | null;

  @ApiProperty({ enum: CefrLevel, example: CefrLevel.B1 })
  cefrLevel!: CefrLevel;

  @ApiProperty({ example: 'có hại', nullable: true })
  contextualMeaningVi!: string | null;

  @ApiProperty({
    example: 'causing damage or injury',
    nullable: true,
  })
  definitionEn!: string | null;

  @ApiProperty({
    example: 'Từ này mô tả tác động tiêu cực trong ngữ cảnh.',
    nullable: true,
  })
  contextualExplanation!: string | null;

  @ApiProperty({
    enum: AiGenerationStatus,
    example: AiGenerationStatus.READY,
  })
  explanationStatus!: AiGenerationStatus;

  @ApiProperty({ type: [String], example: ['damaging'] })
  synonyms!: string[];

  @ApiProperty({ type: [String], example: ['beneficial'] })
  antonyms!: string[];

  @ApiProperty({ type: [String], example: ['harmful effect'] })
  collocations!: string[];

  @ApiProperty({ type: [String], example: ['harm'] })
  relatedTerms!: string[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    example: [
      {
        sentence: 'Plastic waste is harmful to marine life.',
        translationVi: 'Rác thải nhựa có hại cho sinh vật biển.',
      },
    ],
  })
  examples!: unknown[];
}

export class ContextualParentSentenceDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  id!: string;

  @ApiProperty({ example: 4, minimum: 1 })
  sentenceOrder!: number;

  @ApiProperty({ example: 'Plastic waste is harmful to marine life.' })
  sentenceText!: string;

  @ApiProperty({
    example: 'Rác thải nhựa có hại cho sinh vật biển.',
    nullable: true,
  })
  translationVi!: string | null;
}

export class ContextualTermSaveStateDto {
  @ApiProperty({ example: true })
  isSaved!: boolean;

  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440004',
    nullable: true,
  })
  userVocabularyId!: string | null;
}

export class ContextualTermLookupDataDto {
  @ApiProperty({ type: ContextualTermDto })
  term!: ContextualTermDto;

  @ApiProperty({ type: ContextualParentSentenceDto })
  parentSentence!: ContextualParentSentenceDto;

  @ApiProperty({ type: ContextualTermSaveStateDto })
  saveState!: ContextualTermSaveStateDto;
}

export class ContextualTermLookupSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ContextualTermLookupDataDto })
  data!: ContextualTermLookupDataDto;
}
