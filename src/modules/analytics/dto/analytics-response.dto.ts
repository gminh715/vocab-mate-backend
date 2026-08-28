import { ApiProperty } from '@nestjs/swagger';
import {
  ArticleStatus,
  CefrLevel,
} from '../../../../generated/prisma/enums';

export class AnalyticsOverviewDataDto {
  @ApiProperty({ example: 42, description: 'Current saved vocabulary stock.' })
  savedVocabulary!: number;

  @ApiProperty({
    example: 4,
    description:
      'Reading-progress records completed in the requested half-open range.',
  })
  articlesCompleted!: number;

}

export class VocabularyAnalyticsTotalsDto {
  @ApiProperty({ example: 42 })
  total!: number;
}

export class VocabularyCefrCountDto {
  @ApiProperty({ enum: CefrLevel, example: CefrLevel.A1 })
  cefrLevel!: CefrLevel;
  @ApiProperty({ example: 8 })
  count!: number;
}

export class VocabularyTrendBucketDto {
  @ApiProperty({
    example: '2026-07-24',
    description:
      'Configured-analytics-timezone bucket label. Week labels are Monday dates and month labels are first-of-month dates.',
  })
  bucket!: string;
  @ApiProperty({ example: 3 })
  count!: number;
}

export class VocabularyAnalyticsDataDto {
  @ApiProperty({ type: VocabularyAnalyticsTotalsDto })
  totals!: VocabularyAnalyticsTotalsDto;
  @ApiProperty({ type: [VocabularyCefrCountDto] })
  byCefr!: VocabularyCefrCountDto[];
  @ApiProperty({ type: [VocabularyTrendBucketDto] })
  savedTrend!: VocabularyTrendBucketDto[];
}

const successResponse = <T>(dataType: new () => T) => {
  class SuccessResponseDto {
    @ApiProperty({ example: true })
    success!: true;
    @ApiProperty({ type: dataType })
    data!: T;
  }
  return SuccessResponseDto;
};

export class AnalyticsOverviewSuccessResponseDto extends successResponse(
  AnalyticsOverviewDataDto,
) {}

export class VocabularyAnalyticsSuccessResponseDto extends successResponse(
  VocabularyAnalyticsDataDto,
) {}

const ratioProperty = {
  minimum: 0,
  maximum: 1,
  example: 0.75,
  description: 'Decimal ratio from 0 to 1; zero when its denominator is zero.',
} as const;

export class ReadingCategoryAnalyticsDto {
  @ApiProperty({ format: 'uuid' })
  categoryId!: string;
  @ApiProperty()
  categoryName!: string;
  @ApiProperty()
  opened!: number;
  @ApiProperty()
  completed!: number;
  @ApiProperty(ratioProperty)
  completionRate!: number;
}

export class ReadingTrendBucketDto {
  @ApiProperty({ example: '2026-07-24' })
  bucket!: string;
  @ApiProperty()
  opened!: number;
  @ApiProperty()
  completed!: number;
}

export class ReadingAnalyticsDataDto {
  @ApiProperty()
  opened!: number;
  @ApiProperty()
  completed!: number;
  @ApiProperty(ratioProperty)
  completionRate!: number;
  @ApiProperty({ type: [ReadingCategoryAnalyticsDto] })
  byCategory!: ReadingCategoryAnalyticsDto[];
  @ApiProperty({ type: [ReadingTrendBucketDto] })
  trend!: ReadingTrendBucketDto[];
}

export class ReadingAnalyticsSuccessResponseDto extends successResponse(
  ReadingAnalyticsDataDto,
) {}

export class AdminAnalyticsOverviewDataDto {
  @ApiProperty()
  users!: number;
  @ApiProperty()
  activeUsers!: number;
  @ApiProperty()
  articles!: number;
  @ApiProperty()
  publishedArticles!: number;
  @ApiProperty()
  savedVocabulary!: number;
}

export class AdminAnalyticsOverviewSuccessResponseDto extends successResponse(
  AdminAnalyticsOverviewDataDto,
) {}

export class AdminTopArticleDto {
  @ApiProperty({ format: 'uuid' })
  articleId!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty()
  slug!: string;
  @ApiProperty({ enum: ArticleStatus })
  status!: ArticleStatus;
  @ApiProperty()
  category!: string;
  @ApiProperty()
  openedCount!: number;
  @ApiProperty()
  completedCount!: number;
  @ApiProperty()
  savedVocabularyCount!: number;
}

export class AdminArticleCompletionDto {
  @ApiProperty({ format: 'uuid' })
  articleId!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty()
  opened!: number;
  @ApiProperty()
  completed!: number;
  @ApiProperty(ratioProperty)
  completionRate!: number;
}

export class AdminTermSaveDto {
  @ApiProperty({ format: 'uuid' })
  articleSentenceTermId!: string;
  @ApiProperty()
  value!: string;
  @ApiProperty()
  lemma!: string;
  @ApiProperty({ enum: CefrLevel })
  cefrLevel!: CefrLevel;
  @ApiProperty({ format: 'uuid' })
  articleId!: string;
  @ApiProperty()
  articleTitle!: string;
  @ApiProperty()
  saveCount!: number;
}

export class AdminContentAnalyticsDataDto {
  @ApiProperty({ type: [AdminTopArticleDto] })
  topArticles!: AdminTopArticleDto[];
  @ApiProperty({ type: [AdminArticleCompletionDto] })
  completionRates!: AdminArticleCompletionDto[];
  @ApiProperty({ type: [AdminTermSaveDto] })
  termSaveCounts!: AdminTermSaveDto[];
}

export class AdminContentAnalyticsSuccessResponseDto extends successResponse(
  AdminContentAnalyticsDataDto,
) {}

export class RegistrationTrendBucketDto {
  @ApiProperty({ example: '2026-07-24' })
  bucket!: string;
  @ApiProperty()
  registrations!: number;
}

export class RetentionProxyDto {
  @ApiProperty()
  firstWindowActive!: number;
  @ApiProperty()
  secondWindowActive!: number;
  @ApiProperty()
  retainedUsers!: number;
  @ApiProperty(ratioProperty)
  rate!: number;
}

export class LearningDistributionDto {
  @ApiProperty()
  inactive!: number;
  @ApiProperty()
  readingOnly!: number;
  @ApiProperty()
  vocabularyOnly!: number;
  @ApiProperty()
  multiActivity!: number;
}

export class AdminUserAnalyticsDataDto {
  @ApiProperty({ type: [RegistrationTrendBucketDto] })
  registrationsTrend!: RegistrationTrendBucketDto[];
  @ApiProperty()
  activeLearners!: number;
  @ApiProperty({ type: RetentionProxyDto })
  retentionProxy!: RetentionProxyDto;
  @ApiProperty({ type: LearningDistributionDto })
  learningDistribution!: LearningDistributionDto;
}

export class AdminUserAnalyticsSuccessResponseDto extends successResponse(
  AdminUserAnalyticsDataDto,
) {}
