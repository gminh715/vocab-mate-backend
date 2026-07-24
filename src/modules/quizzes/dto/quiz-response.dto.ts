import { ApiProperty } from '@nestjs/swagger';
import {
  ArticleStatus,
  CefrLevel,
  QuestionType,
  QuizStatus,
} from '../../../../generated/prisma/enums';

export class QuizDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  articleId!: string;

  @ApiProperty({ example: 'Technology Vocabulary Review' })
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: QuizStatus })
  status!: QuizStatus;

  @ApiProperty({ format: 'date-time', nullable: true })
  publishedAt!: Date | null;
}

export class AdminQuizDto extends QuizDto {
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class PublicQuizArticleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ nullable: true })
  sourceName!: string | null;

  @ApiProperty({ nullable: true })
  sourceUrl!: string | null;

  @ApiProperty({ nullable: true })
  authorName!: string | null;

  @ApiProperty({ nullable: true })
  thumbnailUrl!: string | null;

  @ApiProperty({ enum: CefrLevel })
  cefrLevel!: CefrLevel;

  @ApiProperty({ enum: ArticleStatus })
  status!: ArticleStatus;

  @ApiProperty({ format: 'date-time', nullable: true })
  publishedAt!: Date | null;
}

export class AdminQuestionOptionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  quizQuestionId!: string;

  @ApiProperty()
  optionText!: string;

  @ApiProperty()
  isCorrect!: boolean;

  @ApiProperty({ nullable: true })
  explanation!: string | null;

  @ApiProperty()
  displayOrder!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class AdminQuizQuestionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  quizId!: string;

  @ApiProperty({ format: 'uuid' })
  articleVocabularyId!: string;

  @ApiProperty({ enum: QuestionType })
  questionType!: QuestionType;

  @ApiProperty()
  prompt!: string;

  @ApiProperty({ nullable: true })
  blankSentence!: string | null;

  @ApiProperty({ nullable: true })
  correctAnswerText!: string | null;

  @ApiProperty({ nullable: true })
  answerExplanation!: string | null;

  @ApiProperty()
  isCaseSensitive!: boolean;

  @ApiProperty()
  points!: number;

  @ApiProperty()
  displayOrder!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: [AdminQuestionOptionDto] })
  options!: AdminQuestionOptionDto[];
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class PublicQuizListDataDto {
  @ApiProperty({ type: [QuizDto] })
  items!: QuizDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PublicQuizListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: PublicQuizListDataDto })
  data!: PublicQuizListDataDto;
}

export class PublicQuizDetailDataDto {
  @ApiProperty({ type: QuizDto })
  quiz!: QuizDto;

  @ApiProperty({ example: 10, minimum: 0 })
  questionCount!: number;

  @ApiProperty({ example: 15, minimum: 0 })
  totalPoints!: number;

  @ApiProperty({ type: PublicQuizArticleDto })
  article!: PublicQuizArticleDto;
}

export class PublicQuizDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: PublicQuizDetailDataDto })
  data!: PublicQuizDetailDataDto;
}

export class AdminQuizListItemDto extends AdminQuizDto {
  @ApiProperty({ example: 10, minimum: 0 })
  questionCount!: number;
}

export class AdminQuizListDataDto {
  @ApiProperty({ type: [AdminQuizListItemDto] })
  items!: AdminQuizListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class AdminQuizListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AdminQuizListDataDto })
  data!: AdminQuizListDataDto;
}

export class AdminQuizDetailDataDto {
  @ApiProperty({ type: AdminQuizDto })
  quiz!: AdminQuizDto;

  @ApiProperty({ type: [AdminQuizQuestionDto] })
  questions!: AdminQuizQuestionDto[];
}

export class AdminQuizDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AdminQuizDetailDataDto })
  data!: AdminQuizDetailDataDto;
}

export class QuizMutationDataDto {
  @ApiProperty({ type: AdminQuizDto })
  quiz!: AdminQuizDto;
}

export class QuizMutationSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: QuizMutationDataDto })
  data!: QuizMutationDataDto;
}

export class QuizQuestionDetailDataDto {
  @ApiProperty({ type: AdminQuizQuestionDto })
  question!: AdminQuizQuestionDto;

  @ApiProperty({ type: [AdminQuestionOptionDto] })
  options!: AdminQuestionOptionDto[];
}

export class QuizQuestionDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: QuizQuestionDetailDataDto })
  data!: QuizQuestionDetailDataDto;
}

export class QuizQuestionMutationDataDto {
  @ApiProperty({ type: AdminQuizQuestionDto })
  question!: AdminQuizQuestionDto;
}

export class QuizQuestionMutationSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: QuizQuestionMutationDataDto })
  data!: QuizQuestionMutationDataDto;
}

export class QuestionOptionMutationDataDto {
  @ApiProperty({ type: AdminQuestionOptionDto })
  option!: AdminQuestionOptionDto;
}

export class QuestionOptionMutationSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: QuestionOptionMutationDataDto })
  data!: QuestionOptionMutationDataDto;
}

export class QuizPublishResultDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: QuizStatus, example: QuizStatus.PUBLISHED })
  status!: QuizStatus;

  @ApiProperty({ format: 'date-time' })
  publishedAt!: Date;
}

export class QuizPublishSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: QuizPublishResultDto })
  data!: QuizPublishResultDto;
}

export class QuizStatusTransitionResultDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: QuizStatus })
  status!: QuizStatus;
}

export class QuizStatusTransitionSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: QuizStatusTransitionResultDto })
  data!: QuizStatusTransitionResultDto;
}

export class QuizPublicationValidationIssueDto {
  @ApiProperty({ example: 'CORRECT_OPTION_COUNT_INVALID' })
  code!: string;

  @ApiProperty({
    example: 'Option-based questions require exactly one correct option.',
  })
  message!: string;

  @ApiProperty({ format: 'uuid', required: false })
  entityId?: string;
}

export class QuizPublicationValidationErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({
    example: {
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Quiz failed publication validation',
      issues: [
        {
          code: 'NO_ACTIVE_QUESTIONS',
          message: 'At least one active question is required.',
        },
      ],
    },
  })
  error!: {
    code: string;
    message: string;
    issues: QuizPublicationValidationIssueDto[];
  };
}
