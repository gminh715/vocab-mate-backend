import { ApiProperty } from '@nestjs/swagger';
import {
  ArticleStatus,
  CefrLevel,
  LearningStatus,
  QuestionType,
  ReviewDecisionSource,
  ReviewSkillDimension,
} from '../../../../generated/prisma/enums';

export class AnalyticsOverviewDataDto {
  @ApiProperty({ example: 42, description: 'Current saved vocabulary stock.' })
  savedVocabulary!: number;

  @ApiProperty({
    example: 7,
    description: 'Current vocabulary due at the captured request time.',
  })
  dueToday!: number;

  @ApiProperty({ example: 12, description: 'Current MASTERED stock.' })
  mastered!: number;

  @ApiProperty({
    example: 4,
    description:
      'Reading-progress records completed in the requested half-open range.',
  })
  articlesCompleted!: number;

  @ApiProperty({
    example: 0.8,
    minimum: 0,
    maximum: 1,
    description:
      'Answer-level accuracy for completed review sessions in the range; zero when there are no answers.',
  })
  quizAccuracy!: number;

  @ApiProperty({
    example: 5,
    description: 'Completed review sessions in the requested range.',
  })
  sessions!: number;
}

export class VocabularyAnalyticsTotalsDto {
  @ApiProperty({ example: 42 })
  total!: number;
  @ApiProperty({ example: 7 })
  due!: number;
  @ApiProperty({ example: 12 })
  mastered!: number;
}

export class VocabularyStatusCountDto {
  @ApiProperty({ enum: LearningStatus, example: LearningStatus.NEW })
  status!: LearningStatus;
  @ApiProperty({ example: 10 })
  count!: number;
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
  @ApiProperty({ type: [VocabularyStatusCountDto] })
  byStatus!: VocabularyStatusCountDto[];
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

export class QuestionTypeAnalyticsDto {
  @ApiProperty({ enum: QuestionType })
  questionType!: QuestionType;
  @ApiProperty()
  answers!: number;
  @ApiProperty()
  correctAnswers!: number;
  @ApiProperty(ratioProperty)
  accuracy!: number;
}

export class QuizTrendBucketDto {
  @ApiProperty({ example: '2026-07-24' })
  bucket!: string;
  @ApiProperty()
  sessions!: number;
  @ApiProperty(ratioProperty)
  accuracy!: number;
  @ApiProperty(ratioProperty)
  averageScore!: number;
}

export class QuizAnalyticsDataDto {
  @ApiProperty()
  sessions!: number;
  @ApiProperty(ratioProperty)
  accuracy!: number;
  @ApiProperty(ratioProperty)
  averageScore!: number;
  @ApiProperty({ type: [QuestionTypeAnalyticsDto] })
  byQuestionType!: QuestionTypeAnalyticsDto[];
  @ApiProperty({ type: [QuizTrendBucketDto] })
  trend!: QuizTrendBucketDto[];
}

export class QuizAnalyticsSuccessResponseDto extends successResponse(
  QuizAnalyticsDataDto,
) {}

export class ReviewRetestAnalyticsDto {
  @ApiProperty()
  attempts!: number;
  @ApiProperty()
  correct!: number;
  @ApiProperty(ratioProperty)
  successRate!: number;
}

export class ReviewSkillAnalyticsDto {
  @ApiProperty({ enum: ReviewSkillDimension })
  skillDimension!: ReviewSkillDimension;
  @ApiProperty()
  attempts!: number;
  @ApiProperty()
  correct!: number;
  @ApiProperty(ratioProperty)
  accuracy!: number;
  @ApiProperty({ nullable: true, example: 3200 })
  averageResponseTimeMs!: number | null;
  @ApiProperty()
  hintsUsed!: number;
}

export class ReviewDurationAnalyticsDto {
  @ApiProperty({ enum: [5, 10, 15] })
  targetDurationMinutes!: number;
  @ApiProperty()
  started!: number;
  @ApiProperty()
  completed!: number;
  @ApiProperty(ratioProperty)
  completionRate!: number;
}

export class ReviewDecisionSourceAnalyticsDto {
  @ApiProperty({ enum: ReviewDecisionSource })
  source!: ReviewDecisionSource;
  @ApiProperty()
  interventions!: number;
  @ApiProperty()
  retestAttempts!: number;
  @ApiProperty()
  successfulRetests!: number;
  @ApiProperty(ratioProperty)
  retestSuccessRate!: number;
}

export class ReviewRetentionWindowDto {
  @ApiProperty()
  followUps!: number;
  @ApiProperty()
  correct!: number;
  @ApiProperty(ratioProperty)
  accuracy!: number;
}

export class ReviewRetentionAnalyticsDto {
  @ApiProperty({ type: ReviewRetentionWindowDto })
  nextDay!: ReviewRetentionWindowDto;
  @ApiProperty({ type: ReviewRetentionWindowDto })
  sevenDay!: ReviewRetentionWindowDto;
}

export class ReviewTrendBucketDto {
  @ApiProperty({ example: '2026-07-24' })
  bucket!: string;
  @ApiProperty()
  answers!: number;
  @ApiProperty()
  correctAnswers!: number;
  @ApiProperty(ratioProperty)
  accuracy!: number;
  @ApiProperty({ nullable: true, example: 3200 })
  averageResponseTimeMs!: number | null;
  @ApiProperty()
  hintsUsed!: number;
}

export class ReviewAnalyticsDataDto {
  @ApiProperty()
  sessionsStarted!: number;
  @ApiProperty()
  sessionsCompleted!: number;
  @ApiProperty()
  sessionsAbandoned!: number;
  @ApiProperty(ratioProperty)
  completionRate!: number;
  @ApiProperty()
  answers!: number;
  @ApiProperty()
  correctAnswers!: number;
  @ApiProperty(ratioProperty)
  accuracy!: number;
  @ApiProperty({ nullable: true, example: 3200 })
  averageResponseTimeMs!: number | null;
  @ApiProperty()
  hintsUsed!: number;
  @ApiProperty({ type: ReviewRetestAnalyticsDto })
  sameSessionRetest!: ReviewRetestAnalyticsDto;
  @ApiProperty({ type: [ReviewSkillAnalyticsDto] })
  bySkill!: ReviewSkillAnalyticsDto[];
  @ApiProperty({ type: [ReviewDurationAnalyticsDto] })
  byDuration!: ReviewDurationAnalyticsDto[];
  @ApiProperty({ type: [ReviewDecisionSourceAnalyticsDto] })
  byDecisionSource!: ReviewDecisionSourceAnalyticsDto[];
  @ApiProperty({ type: ReviewRetentionAnalyticsDto })
  retention!: ReviewRetentionAnalyticsDto;
  @ApiProperty({ type: [ReviewTrendBucketDto] })
  trend!: ReviewTrendBucketDto[];
}

export class ReviewAnalyticsSuccessResponseDto extends successResponse(
  ReviewAnalyticsDataDto,
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
  @ApiProperty()
  completedSessions!: number;
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
  @ApiProperty()
  completedQuizSessions!: number;
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
  normalizedLemma!: string;
  @ApiProperty({ enum: CefrLevel })
  cefrLevel!: CefrLevel;
  @ApiProperty({ format: 'uuid' })
  articleId!: string;
  @ApiProperty()
  articleTitle!: string;
  @ApiProperty()
  saveCount!: number;
}

export class AdminQuizPerformanceDto {
  @ApiProperty({ format: 'uuid' })
  quizId!: string;
  @ApiProperty()
  quizTitle!: string;
  @ApiProperty({ format: 'uuid' })
  articleId!: string;
  @ApiProperty()
  articleTitle!: string;
  @ApiProperty()
  completedSessions!: number;
  @ApiProperty(ratioProperty)
  accuracy!: number;
  @ApiProperty(ratioProperty)
  averageScore!: number;
}

export class AdminContentAnalyticsDataDto {
  @ApiProperty({ type: [AdminTopArticleDto] })
  topArticles!: AdminTopArticleDto[];
  @ApiProperty({ type: [AdminArticleCompletionDto] })
  completionRates!: AdminArticleCompletionDto[];
  @ApiProperty({ type: [AdminTermSaveDto] })
  termSaveCounts!: AdminTermSaveDto[];
  @ApiProperty({ type: [AdminQuizPerformanceDto] })
  quizPerformance!: AdminQuizPerformanceDto[];
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
  quizOnly!: number;
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
