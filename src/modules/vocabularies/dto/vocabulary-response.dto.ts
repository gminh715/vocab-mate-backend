import { ApiProperty } from '@nestjs/swagger';
import { CefrLevel, LearningStatus } from '../../../../generated/prisma/enums';
import { PaginationMetaDto } from '../../../common/dto/pagination-meta.dto';

export class VocabularyCollectionSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Difficult Words' })
  name!: string;

  @ApiProperty({ format: 'date-time' })
  addedAt!: Date;
}

export class VocabularySnapshotDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  articleSentenceTermId!: string;

  @ApiProperty({ enum: LearningStatus })
  learningStatus!: LearningStatus;

  @ApiProperty({ example: 'harmful' })
  savedWordDisplay!: string;

  @ApiProperty({ example: 'harmful' })
  savedLemma!: string;

  @ApiProperty({ example: 'adjective' })
  savedPartOfSpeech!: string;

  @ApiProperty({ nullable: true })
  savedIpa!: string | null;

  @ApiProperty({ enum: CefrLevel })
  savedCefrLevel!: CefrLevel;

  @ApiProperty({ example: 'có hại' })
  savedMeaningVi!: string;

  @ApiProperty({ format: 'date-time' })
  savedAt!: Date;

  @ApiProperty({ format: 'date-time', nullable: true })
  nextReviewAt!: Date | null;
}

export class VocabularyListItemDto extends VocabularySnapshotDto {
  @ApiProperty({ type: [VocabularyCollectionSummaryDto] })
  collections!: VocabularyCollectionSummaryDto[];
}

export class VocabularyDetailDto extends VocabularySnapshotDto {
  @ApiProperty()
  savedContextSentence!: string;

  @ApiProperty()
  savedContextTranslationVi!: string;

  @ApiProperty({ nullable: true })
  savedExplanation!: string | null;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  savedExamples!: unknown[];

  @ApiProperty({ format: 'date-time', nullable: true })
  lastReviewedAt!: Date | null;

  @ApiProperty({ nullable: true })
  reviewIntervalDays!: number | null;
}

export class VocabularySourceArticleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  thumbnailUrl!: string | null;

  @ApiProperty({ nullable: true })
  sourceName!: string | null;

  @ApiProperty({ nullable: true })
  sourceUrl!: string | null;
}

export class VocabularyListDataDto {
  @ApiProperty({ type: [VocabularyListItemDto] })
  items!: VocabularyListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class VocabularyListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: VocabularyListDataDto })
  data!: VocabularyListDataDto;
}

export class VocabularyDetailDataDto {
  @ApiProperty({ type: VocabularyDetailDto })
  vocabulary!: VocabularyDetailDto;

  @ApiProperty({ type: [VocabularyCollectionSummaryDto] })
  collections!: VocabularyCollectionSummaryDto[];

  @ApiProperty({ type: VocabularySourceArticleDto })
  sourceArticle!: VocabularySourceArticleDto;
}

export class VocabularyDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: VocabularyDetailDataDto })
  data!: VocabularyDetailDataDto;
}

export class VocabularySaveDataDto {
  @ApiProperty({ type: VocabularyDetailDto })
  vocabulary!: VocabularyDetailDto;

  @ApiProperty({ type: [VocabularyCollectionSummaryDto] })
  collections!: VocabularyCollectionSummaryDto[];
}

export class VocabularySaveSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: VocabularySaveDataDto })
  data!: VocabularySaveDataDto;
}
