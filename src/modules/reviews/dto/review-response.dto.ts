import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArticleStatus,
  QuestionType,
  QuizStatus,
  ReviewSessionStatus,
  ReviewSessionType,
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
  @ApiProperty({ enum: ReviewSessionStatus })
  status!: ReviewSessionStatus;
  @ApiProperty({ format: 'date-time' })
  startedAt!: Date;
  @ApiProperty({ format: 'date-time', nullable: true })
  completedAt!: Date | null;
}

export class SessionQuestionOptionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  text!: string;
  @ApiProperty()
  displayOrder!: number;
}

export class SessionQuestionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: QuestionType })
  questionType!: QuestionType;
  @ApiProperty()
  prompt!: string;
  @ApiProperty({ nullable: true })
  blankSentence!: string | null;
  @ApiProperty()
  points!: number;
  @ApiProperty()
  displayOrder!: number;
  @ApiProperty({ type: [SessionQuestionOptionDto] })
  options!: SessionQuestionOptionDto[];
}

export class StartReviewSessionDataDto {
  @ApiProperty({ type: ReviewSessionDto })
  session!: ReviewSessionDto;
  @ApiProperty({ type: [SessionQuestionDto] })
  questions!: SessionQuestionDto[];
}

export class ReviewProgressDto {
  @ApiProperty()
  answeredCount!: number;
  @ApiProperty()
  totalQuestions!: number;
  @ApiProperty()
  remainingCount!: number;
  @ApiProperty({ example: 66.67 })
  progressPercent!: number;
}

export class ReviewSessionStateDataDto {
  @ApiProperty({ type: ReviewSessionDto })
  session!: ReviewSessionDto;
  @ApiProperty({ type: ReviewProgressDto })
  progress!: ReviewProgressDto;
  @ApiPropertyOptional({ type: SessionQuestionDto })
  nextQuestion?: SessionQuestionDto;
}

export class SubmittedReviewAnswerDataDto {
  @ApiProperty({ format: 'uuid' })
  answerId!: string;
  @ApiProperty()
  isCorrect!: boolean;
  @ApiProperty()
  correctAnswer!: string;
  @ApiProperty({ nullable: true })
  explanation!: string | null;
  @ApiProperty()
  earnedPoints!: number;
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

export class CompleteReviewSessionDataDto {
  @ApiProperty({ type: ReviewResultDto })
  result!: ReviewResultDto;
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

export class CompletedReviewResultDataDto {
  @ApiProperty({ type: ReviewResultDto })
  result!: ReviewResultDto;
  @ApiProperty({ type: [ReviewResultAnswerDto] })
  answers!: ReviewResultAnswerDto[];
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
  @ApiProperty({ type: [RecommendedQuizDto] })
  recommendedQuizzes!: RecommendedQuizDto[];
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
export class CompleteReviewSessionSuccessResponseDto extends successResponse(
  CompleteReviewSessionDataDto,
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
