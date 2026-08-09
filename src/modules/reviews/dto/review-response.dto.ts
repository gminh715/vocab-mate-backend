import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArticleStatus,
  QuestionType,
  QuizStatus,
  ReviewAgentAction,
  ReviewDecisionSource,
  ReviewErrorType,
  ReviewGoal,
  ReviewSessionStatus,
  ReviewSessionType,
  ReviewSkillDimension,
} from '../../../../generated/prisma/enums';

export class ReviewSessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ReviewSessionType })
  sessionType!: ReviewSessionType;
  @ApiProperty({ format: 'uuid', nullable: true })
  quizId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true })
  articleId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true })
  collectionId!: string | null;
  @ApiPropertyOptional({ enum: [5, 10, 15], nullable: true })
  targetDurationMinutes!: number | null;
  @ApiPropertyOptional({ enum: ReviewGoal, nullable: true })
  reviewGoal!: ReviewGoal | null;
  @ApiPropertyOptional({ nullable: true, minimum: 1 })
  plannedItemCount!: number | null;
  @ApiProperty({
    nullable: true,
    example: 'Review recall first, then reinforce meaning in context.',
    description:
      'Persisted learner-facing session plan. Null for legacy or unplanned sessions.',
  })
  planSummary!: string | null;
  @ApiProperty({ enum: ReviewSessionStatus })
  status!: ReviewSessionStatus;
  @ApiProperty({ format: 'date-time' })
  startedAt!: Date;
  @ApiProperty({ format: 'date-time', nullable: true })
  completedAt!: Date | null;
}

export class SessionQuestionOptionDto {
  @ApiProperty({
    format: 'uuid',
    example: '8cc0eb2c-f9d1-4d87-ab2f-13b381a13017',
  })
  id!: string;
  @ApiProperty({ example: 'hấp dẫn' })
  text!: string;
  @ApiProperty({ example: 1 })
  displayOrder!: number;
}

export class SessionQuestionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: QuestionType, example: QuestionType.SELECT_MEANING })
  questionType!: QuestionType;
  @ApiProperty({ example: 'What does “engaging” mean in this sentence?' })
  prompt!: string;
  @ApiProperty({ nullable: true, example: null })
  blankSentence!: string | null;
  @ApiProperty()
  points!: number;
  @ApiProperty()
  displayOrder!: number;
  @ApiProperty({ type: [SessionQuestionOptionDto] })
  options!: SessionQuestionOptionDto[];
}

export class ReviewProgressDto {
  @ApiProperty({ example: 4 })
  answeredCount!: number;
  @ApiProperty({ example: 10 })
  totalQuestions!: number;
  @ApiProperty({ example: 6 })
  remainingCount!: number;
  @ApiProperty({ example: 66.67 })
  progressPercent!: number;
}

export class SessionReviewItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  userVocabularyId!: string;
  @ApiProperty()
  attemptNumber!: number;
  @ApiProperty({ type: SessionQuestionDto })
  question!: SessionQuestionDto;
}

export class ReviewAgentMicroLessonDto {
  @ApiProperty()
  title!: string;
  @ApiProperty()
  explanation!: string;
  @ApiProperty()
  example!: string;
}

export class ReviewAgentFeedbackDto {
  @ApiProperty({ enum: ReviewDecisionSource })
  source!: ReviewDecisionSource;
  @ApiProperty({ enum: ReviewAgentAction })
  action!: ReviewAgentAction;
  @ApiProperty({ enum: ReviewSkillDimension })
  skillDimension!: ReviewSkillDimension;
  @ApiProperty({ enum: ReviewErrorType })
  errorType!: ReviewErrorType;
  @ApiPropertyOptional({ type: ReviewAgentMicroLessonDto })
  microLesson?: ReviewAgentMicroLessonDto;
  @ApiPropertyOptional({ minimum: 2, maximum: 5 })
  retestAfterItems?: number;
}

export class StartReviewSessionDataDto {
  @ApiProperty({ type: ReviewSessionDto })
  session!: ReviewSessionDto;
  @ApiProperty({ type: ReviewProgressDto })
  progress!: ReviewProgressDto;
  @ApiPropertyOptional({ type: SessionReviewItemDto })
  nextItem?: SessionReviewItemDto;
  @ApiPropertyOptional({ type: ReviewAgentFeedbackDto })
  agentFeedback?: ReviewAgentFeedbackDto;
}

export class ReviewSessionStateDataDto {
  @ApiProperty({ type: ReviewSessionDto })
  session!: ReviewSessionDto;
  @ApiProperty({ type: ReviewProgressDto })
  progress!: ReviewProgressDto;
  @ApiPropertyOptional({ type: SessionReviewItemDto })
  nextItem?: SessionReviewItemDto;
  @ApiPropertyOptional({ type: ReviewAgentFeedbackDto })
  agentFeedback?: ReviewAgentFeedbackDto;
}

export class ReviewResultDto {
  @ApiProperty()
  score!: number;
  @ApiProperty()
  totalPoints!: number;
  @ApiProperty({ example: 0.75 })
  accuracy!: number;
  @ApiProperty()
  correctCount!: number;
  @ApiProperty({ format: 'date-time' })
  completedAt!: Date;
}

export class SubmittedReviewAnswerDataDto {
  @ApiProperty({ format: 'uuid' })
  answerId!: string;
  @ApiProperty({ example: false })
  isCorrect!: boolean;
  @ApiProperty({ example: 'hấp dẫn' })
  correctAnswer!: string;
  @ApiProperty({
    description:
      'A short persisted explanation, with a deterministic fallback for legacy questions.',
    example: 'It means something holds your interest in this context.',
  })
  explanation!: string;
  @ApiProperty({ example: 0 })
  earnedPoints!: number;
  @ApiProperty({
    minimum: 0,
    maximum: 5,
    example: 0,
    description:
      'Server-inferred scheduling score. Clients must not ask the learner to provide or display it.',
  })
  inferredReviewScore!: number;
  @ApiProperty({
    description: 'Whether an incorrect word was requeued for another attempt.',
    example: true,
  })
  willReturnLater!: boolean;
  @ApiProperty({ example: false })
  sessionCompleted!: boolean;
  @ApiProperty({ type: ReviewProgressDto })
  progress!: ReviewProgressDto;
  @ApiPropertyOptional({ type: SessionReviewItemDto })
  nextQuestion?: SessionReviewItemDto;
  @ApiPropertyOptional({ type: ReviewAgentFeedbackDto })
  agentFeedback?: ReviewAgentFeedbackDto;
  @ApiPropertyOptional({ type: ReviewResultDto })
  completionSummary?: ReviewResultDto;
}

export class SkippedReviewItemDataDto {
  @ApiProperty({ minimum: 0, maximum: 5, example: 0 })
  inferredReviewScore!: number;
  @ApiProperty()
  sessionCompleted!: boolean;
  @ApiProperty({ type: ReviewProgressDto })
  progress!: ReviewProgressDto;
  @ApiPropertyOptional({ type: SessionReviewItemDto })
  nextQuestion?: SessionReviewItemDto;
  @ApiPropertyOptional({ type: ReviewResultDto })
  completionSummary?: ReviewResultDto;
}

export class AbandonReviewSessionDataDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({
    enum: ReviewSessionStatus,
    example: ReviewSessionStatus.ABANDONED,
  })
  status!: ReviewSessionStatus;
}

export class ReviewAggregateDto {
  @ApiProperty()
  answeredCount!: number;
  @ApiProperty()
  correctCount!: number;
  @ApiProperty()
  score!: number;
  @ApiProperty()
  totalPoints!: number;
  @ApiProperty()
  accuracy!: number;
}

export class ReviewHistoryQuizDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty({ enum: QuizStatus })
  status!: QuizStatus;
}

export class ReviewHistoryArticleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty()
  slug!: string;
  @ApiProperty({ enum: ArticleStatus })
  status!: ArticleStatus;
  @ApiProperty({ nullable: true })
  thumbnailUrl!: string | null;
}

export class ReviewHistoryItemDto {
  @ApiProperty({ type: ReviewSessionDto })
  session!: ReviewSessionDto;
  @ApiProperty({ type: ReviewHistoryQuizDto, nullable: true })
  quiz!: ReviewHistoryQuizDto | null;
  @ApiProperty({ type: ReviewHistoryArticleDto, nullable: true })
  article!: ReviewHistoryArticleDto | null;
  @ApiProperty({ type: ReviewAggregateDto })
  aggregates!: ReviewAggregateDto;
}

export class PaginationMetaDto {
  @ApiProperty()
  page!: number;
  @ApiProperty()
  limit!: number;
  @ApiProperty()
  total!: number;
  @ApiProperty()
  totalPages!: number;
}

export class ReviewHistoryDataDto {
  @ApiProperty({ type: [ReviewHistoryItemDto] })
  items!: ReviewHistoryItemDto[];
  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class ReviewResultAnswerDto {
  @ApiProperty({ format: 'uuid' })
  quizQuestionId!: string;
  @ApiProperty({ enum: QuestionType })
  questionType!: QuestionType;
  @ApiProperty()
  prompt!: string;
  @ApiProperty({ type: SessionQuestionOptionDto, nullable: true })
  selectedOption!: SessionQuestionOptionDto | null;
  @ApiProperty({ nullable: true })
  userAnswerText!: string | null;
  @ApiProperty()
  correctAnswer!: string;
  @ApiProperty({ nullable: true })
  explanation!: string | null;
  @ApiProperty()
  isCorrect!: boolean;
  @ApiProperty()
  points!: number;
  @ApiProperty()
  earnedPoints!: number;
  @ApiProperty({ format: 'date-time' })
  answeredAt!: Date;
}

export class ReviewSkillBreakdownDto {
  @ApiProperty({ enum: ReviewSkillDimension })
  skillDimension!: ReviewSkillDimension;
  @ApiProperty({ minimum: 1 })
  attempts!: number;
  @ApiProperty({ minimum: 0 })
  correct!: number;
  @ApiProperty({ minimum: 0, maximum: 1, example: 0.75 })
  accuracy!: number;
}

export class ReviewCoachSummaryDto {
  @ApiProperty({ type: [String], enum: ReviewSkillDimension })
  strengths!: ReviewSkillDimension[];
  @ApiProperty({ type: [String], enum: ReviewSkillDimension })
  focusNext!: ReviewSkillDimension[];
  @ApiProperty()
  message!: string;
  @ApiProperty({ enum: ReviewDecisionSource })
  source!: ReviewDecisionSource;
}

export class ReviewWordToRevisitDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  userVocabularyId!: string | null;
  @ApiProperty()
  wordOrPhrase!: string;
  @ApiProperty({ nullable: true })
  meaningVi!: string | null;
  @ApiProperty({ enum: ReviewSkillDimension, nullable: true })
  skillDimension!: ReviewSkillDimension | null;
  @ApiProperty({ enum: ReviewErrorType, nullable: true })
  errorType!: ReviewErrorType | null;
  @ApiProperty({ nullable: true })
  explanation!: string | null;
  @ApiProperty({
    description:
      'True when a later attempt for the same session item was correct.',
  })
  recoveredInSession!: boolean;
}

export class CompletedReviewResultDataDto {
  @ApiProperty({ type: ReviewResultDto })
  result!: ReviewResultDto;
  @ApiProperty({ type: [ReviewResultAnswerDto] })
  answers!: ReviewResultAnswerDto[];
  @ApiProperty({ type: [ReviewSkillBreakdownDto] })
  skillBreakdown!: ReviewSkillBreakdownDto[];
  @ApiProperty({ type: ReviewCoachSummaryDto })
  coachSummary!: ReviewCoachSummaryDto;
  @ApiProperty({ type: [ReviewWordToRevisitDto] })
  wordsToRevisit!: ReviewWordToRevisitDto[];
}

export class DueReviewArticleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty()
  slug!: string;
  @ApiProperty({ nullable: true })
  thumbnailUrl!: string | null;
}

export class RecommendedQuizDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty({ nullable: true })
  description!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true })
  publishedAt!: Date | null;
  @ApiProperty()
  matchingDueVocabularyCount!: number;
  @ApiProperty()
  activeQuestionCount!: number;
  @ApiProperty()
  totalPoints!: number;
  @ApiProperty({ type: DueReviewArticleDto })
  article!: DueReviewArticleDto;
}

export class DueReviewsDataDto {
  @ApiProperty()
  dueVocabularyCount!: number;
  @ApiProperty({ type: () => [DailyReviewEstimateDto] })
  dailyReviewEstimates!: DailyReviewEstimateDto[];
  @ApiProperty({ type: [RecommendedQuizDto] })
  recommendedQuizzes!: RecommendedQuizDto[];
}

export class DailyReviewEstimateDto {
  @ApiProperty({ enum: [5, 10, 15] })
  targetDurationMinutes!: number;
  @ApiProperty({
    minimum: 0,
    description: 'Backward-compatible estimate for the BALANCED review goal.',
  })
  estimatedItemCount!: number;
  @ApiProperty({
    type: () => [DailyReviewGoalEstimateDto],
    description:
      'Goal-specific estimates ordered as BALANCED, RECALL, SPELLING, CONTEXT.',
  })
  goalEstimates!: DailyReviewGoalEstimateDto[];
}

export class DailyReviewGoalEstimateDto {
  @ApiProperty({ enum: ReviewGoal })
  reviewGoal!: ReviewGoal;
  @ApiProperty({ minimum: 0 })
  estimatedItemCount!: number;
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

export class StartReviewSessionSuccessResponseDto extends successResponse(
  StartReviewSessionDataDto,
) {}
export class ReviewSessionStateSuccessResponseDto extends successResponse(
  ReviewSessionStateDataDto,
) {}
export class SubmitReviewAnswerSuccessResponseDto extends successResponse(
  SubmittedReviewAnswerDataDto,
) {}
export class SkipReviewItemSuccessResponseDto extends successResponse(
  SkippedReviewItemDataDto,
) {}
export class AbandonReviewSessionSuccessResponseDto extends successResponse(
  AbandonReviewSessionDataDto,
) {}
export class ReviewHistorySuccessResponseDto extends successResponse(
  ReviewHistoryDataDto,
) {}
export class CompletedReviewResultSuccessResponseDto extends successResponse(
  CompletedReviewResultDataDto,
) {}
export class DueReviewsSuccessResponseDto extends successResponse(
  DueReviewsDataDto,
) {}
