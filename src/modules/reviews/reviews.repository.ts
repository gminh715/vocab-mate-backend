import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import {
  ArticleStatus,
  LearningStatus,
  QuizStatus,
  ReviewItemType,
  ReviewSessionStatus,
  ReviewSessionType,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import type {
  GetDueReviewsQueryDto,
  GetReviewHistoryQueryDto,
  SubmitReviewAnswerDto,
} from './dto/review-request.dto';
import {
  AnswerGradingService,
  InvalidAnswerRelationshipError,
  InvalidAnswerShapeError,
  type GradingQuestion,
} from './services/answer-grading.service';
import { ReviewSchedulerService } from './services/review-scheduler.service';

export class ReviewResourceNotFoundError extends Error {}
export class ReviewSessionStateConflictError extends Error {}
export class ActiveReviewSessionConflictError extends Error {}
export class DuplicateReviewAnswerConflictError extends Error {}
export class IncompleteReviewSessionConflictError extends Error {}
export class ReviewConcurrencyConflictError extends Error {}

const MAX_SERIALIZABLE_ATTEMPTS = 3;

const sessionSelect = {
  id: true,
  sessionType: true,
  quizId: true,
  articleId: true,
  status: true,
  startedAt: true,
  completedAt: true,
} as const;

const safeOptionSelect = {
  id: true,
  optionText: true,
  displayOrder: true,
} as const;

const safeQuestionSelect = {
  id: true,
  questionType: true,
  prompt: true,
  blankSentence: true,
  points: true,
  displayOrder: true,
  options: {
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: safeOptionSelect,
  },
} satisfies Prisma.QuizQuestionSelect;

const gradingQuestionSelect = {
  id: true,
  articleVocabularyId: true,
  questionType: true,
  correctAnswerText: true,
  answerExplanation: true,
  isCaseSensitive: true,
  points: true,
  options: {
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      optionText: true,
      isCorrect: true,
      explanation: true,
    },
  },
} satisfies Prisma.QuizQuestionSelect;

export interface QuizResult {
  score: number;
  totalPoints: number;
  accuracy: number;
  correctCount: number;
  completedAt: Date;
}

export interface ReviewHistoryQuery extends Omit<
  GetReviewHistoryQueryDto,
  'from' | 'to'
> {
  from?: Date;
  to?: Date;
}

interface ResultQuestion {
  points: number;
  reviewAnswers: Array<{ isCorrect: boolean | null }>;
}

interface RawDueQuiz {
  id: string;
  title: string;
  description: string | null;
  publishedAt: Date | null;
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  articleThumbnailUrl: string | null;
  matchingDueVocabularyCount: number;
  activeQuestionCount: number;
  totalPoints: number;
}

@Injectable()
export class ReviewsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly answerGradingService: AnswerGradingService,
    private readonly reviewSchedulerService: ReviewSchedulerService,
  ) {}

  startQuizSession(userId: string, quizId: string) {
    return this.withSerializableRetry(async (tx) => {
      const quiz = await tx.quiz.findFirst({
        where: {
          id: quizId,
          status: QuizStatus.PUBLISHED,
          article: { is: { status: ArticleStatus.PUBLISHED } },
          questions: { some: { isActive: true } },
        },
        select: {
          id: true,
          articleId: true,
          questions: {
            where: { isActive: true },
            orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
            select: safeQuestionSelect,
          },
        },
      });
      if (!quiz) return null;

      const active = await tx.reviewSession.findFirst({
        where: {
          userId,
          quizId,
          status: ReviewSessionStatus.IN_PROGRESS,
        },
        select: { id: true },
      });
      if (active) throw new ActiveReviewSessionConflictError();

      const session = await tx.reviewSession.create({
        data: {
          userId,
          sessionType: ReviewSessionType.QUIZ,
          quizId,
          articleId: quiz.articleId,
          status: ReviewSessionStatus.IN_PROGRESS,
          completedAt: null,
        },
        select: sessionSelect,
      });
      return {
        session,
        questions: quiz.questions.map((question) =>
          this.mapSafeQuestion(question),
        ),
      };
    });
  }

  async getSessionState(userId: string, sessionId: string) {
    const session = await this.prisma.reviewSession.findFirst({
      where: { id: sessionId, userId },
      select: sessionSelect,
    });
    if (!session?.quizId) return null;

    const answeredWhere: Prisma.QuizQuestionWhereInput = {
      quizId: session.quizId,
      isActive: true,
      reviewAnswers: { some: { reviewSessionId: session.id } },
    };
    const [totalQuestions, answeredCount, next] = await Promise.all([
      this.prisma.quizQuestion.count({
        where: { quizId: session.quizId, isActive: true },
      }),
      this.prisma.quizQuestion.count({ where: answeredWhere }),
      session.status === ReviewSessionStatus.IN_PROGRESS
        ? this.prisma.quizQuestion.findFirst({
            where: {
              quizId: session.quizId,
              isActive: true,
              reviewAnswers: { none: { reviewSessionId: session.id } },
            },
            orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
            select: safeQuestionSelect,
          })
        : Promise.resolve(null),
    ]);

    return {
      session,
      answeredCount,
      totalQuestions,
      nextQuestion: next ? this.mapSafeQuestion(next) : undefined,
    };
  }

  submitAnswer(userId: string, sessionId: string, dto: SubmitReviewAnswerDto) {
    return this.withSerializableRetry(async (tx) => {
      const session = await tx.reviewSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true, quizId: true, status: true },
      });
      if (!session?.quizId) throw new ReviewResourceNotFoundError();
      if (session.status !== ReviewSessionStatus.IN_PROGRESS) {
        throw new ReviewSessionStateConflictError();
      }

      const question = await tx.quizQuestion.findFirst({
        where: {
          id: dto.quizQuestionId,
          quizId: session.quizId,
          isActive: true,
        },
        select: gradingQuestionSelect,
      });
      if (!question) throw new ReviewResourceNotFoundError();

      const existing = await tx.reviewAnswer.findFirst({
        where: {
          reviewSessionId: session.id,
          quizQuestionId: question.id,
        },
        select: { id: true },
      });
      if (existing) throw new DuplicateReviewAnswerConflictError();

      const grading = this.answerGradingService.grade(question, {
        ...(dto.selectedOptionId === undefined
          ? {}
          : { selectedOptionId: dto.selectedOptionId }),
        ...(dto.userAnswerText === undefined
          ? {}
          : { userAnswerText: dto.userAnswerText }),
      });
      const vocabulary = await tx.userVocabulary.findUnique({
        where: {
          userId_articleSentenceTermId: {
            userId,
            articleSentenceTermId: question.articleVocabularyId,
          },
        },
        select: { id: true, reviewIntervalDays: true },
      });
      const now = new Date();
      const answer = await tx.reviewAnswer.create({
        data: {
          reviewSessionId: session.id,
          articleVocabularyId: question.articleVocabularyId,
          userVocabularyId: vocabulary?.id ?? null,
          itemType: ReviewItemType.QUIZ_QUESTION,
          quizQuestionId: question.id,
          selectedOptionId: grading.selectedOptionId,
          userAnswerText: dto.userAnswerText ?? null,
          isCorrect: grading.isCorrect,
          responseTimeMs: dto.responseTimeMs ?? null,
          attemptNumber: 1,
          answeredAt: now,
        },
        select: { id: true },
      });

      if (vocabulary) {
        await tx.userVocabulary.update({
          where: { id: vocabulary.id },
          data: this.reviewSchedulerService.schedule(
            grading.isCorrect,
            vocabulary.reviewIntervalDays,
            now,
          ),
          select: { id: true },
        });
      }

      return {
        answerId: answer.id,
        isCorrect: grading.isCorrect,
        correctAnswer: grading.correctAnswer,
        explanation: grading.explanation,
        earnedPoints: grading.earnedPoints,
      };
    });
  }

  completeSession(userId: string, sessionId: string) {
    return this.withSerializableRetry(async (tx) => {
      const session = await tx.reviewSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true, quizId: true, status: true },
      });
      if (!session?.quizId) throw new ReviewResourceNotFoundError();
      if (session.status !== ReviewSessionStatus.IN_PROGRESS) {
        throw new ReviewSessionStateConflictError();
      }
      const questions = await tx.quizQuestion.findMany({
        where: { quizId: session.quizId, isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        select: {
          points: true,
          reviewAnswers: {
            where: { reviewSessionId: session.id },
            select: { isCorrect: true },
          },
        },
      });
      if (
        questions.length === 0 ||
        questions.some(({ reviewAnswers }) => reviewAnswers.length !== 1)
      ) {
        throw new IncompleteReviewSessionConflictError();
      }
      const completedAt = new Date();
      const updated = await tx.reviewSession.updateMany({
        where: {
          id: session.id,
          userId,
          status: ReviewSessionStatus.IN_PROGRESS,
        },
        data: {
          status: ReviewSessionStatus.COMPLETED,
          completedAt,
        },
      });
      if (updated.count !== 1) throw new ReviewSessionStateConflictError();

      return { result: this.calculateResult(questions, completedAt) };
    });
  }

  abandonSession(userId: string, sessionId: string) {
    return this.withSerializableRetry(async (tx) => {
      const session = await tx.reviewSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true, status: true },
      });
      if (!session) throw new ReviewResourceNotFoundError();
      if (session.status !== ReviewSessionStatus.IN_PROGRESS) {
        throw new ReviewSessionStateConflictError();
      }
      const updated = await tx.reviewSession.updateMany({
        where: {
          id: session.id,
          userId,
          status: ReviewSessionStatus.IN_PROGRESS,
        },
        data: {
          status: ReviewSessionStatus.ABANDONED,
          completedAt: null,
        },
      });
      if (updated.count !== 1) throw new ReviewSessionStateConflictError();
      return { id: session.id, status: ReviewSessionStatus.ABANDONED };
    });
  }

  async listHistory(userId: string, query: ReviewHistoryQuery) {
    const where: Prisma.ReviewSessionWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.articleId ? { articleId: query.articleId } : {}),
      ...(query.quizId ? { quizId: query.quizId } : {}),
      ...(query.from || query.to
        ? {
            startedAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.reviewSession.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
        select: {
          ...sessionSelect,
          quiz: {
            select: {
              id: true,
              title: true,
              status: true,
              questions: {
                where: { isActive: true },
                select: {
                  id: true,
                  points: true,
                },
              },
            },
          },
          article: {
            select: {
              id: true,
              title: true,
              slug: true,
              status: true,
              thumbnailUrl: true,
            },
          },
          answers: {
            select: {
              quizQuestionId: true,
              isCorrect: true,
            },
          },
        },
      }),
      this.prisma.reviewSession.count({ where }),
    ]);

    return {
      items: rows.map((row) => {
        const answersByQuestion = new Map(
          row.answers.map((answer) => [answer.quizQuestionId, answer]),
        );
        const questions =
          row.quiz?.questions.map((question) => ({
            points: question.points,
            reviewAnswers: answersByQuestion.has(question.id)
              ? [
                  {
                    isCorrect:
                      answersByQuestion.get(question.id)?.isCorrect ?? null,
                  },
                ]
              : [],
          })) ?? [];
        return {
          session: {
            id: row.id,
            sessionType: row.sessionType,
            quizId: row.quizId,
            articleId: row.articleId,
            status: row.status,
            startedAt: row.startedAt,
            completedAt: row.completedAt,
          },
          quiz: row.quiz
            ? {
                id: row.quiz.id,
                title: row.quiz.title,
                status: row.quiz.status,
              }
            : null,
          article: row.article,
          aggregates: this.calculateAggregates(questions),
        };
      }),
      total,
    };
  }

  async getCompletedResult(userId: string, sessionId: string) {
    const session = await this.prisma.reviewSession.findFirst({
      where: { id: sessionId, userId },
      select: {
        ...sessionSelect,
        quiz: {
          select: {
            questions: {
              where: { isActive: true },
              orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
              select: {
                ...gradingQuestionSelect,
                prompt: true,
                displayOrder: true,
                options: {
                  orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
                  select: {
                    id: true,
                    optionText: true,
                    isCorrect: true,
                    explanation: true,
                    displayOrder: true,
                  },
                },
                reviewAnswers: {
                  where: { reviewSessionId: sessionId },
                  orderBy: [{ answeredAt: 'asc' }, { id: 'asc' }],
                  select: {
                    selectedOptionId: true,
                    userAnswerText: true,
                    isCorrect: true,
                    answeredAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!session?.quiz) return null;
    if (
      session.status !== ReviewSessionStatus.COMPLETED ||
      !session.completedAt
    ) {
      throw new ReviewSessionStateConflictError();
    }
    const resultQuestions = session.quiz.questions.map((question) => ({
      points: question.points,
      reviewAnswers: question.reviewAnswers.map(({ isCorrect }) => ({
        isCorrect,
      })),
    }));
    const answers = session.quiz.questions.flatMap((question) => {
      const answer = question.reviewAnswers[0];
      if (!answer) return [];
      const selectedOption =
        question.options.find(({ id }) => id === answer.selectedOptionId) ??
        null;
      return [
        {
          quizQuestionId: question.id,
          questionType: question.questionType,
          prompt: question.prompt,
          selectedOption: selectedOption
            ? {
                id: selectedOption.id,
                text: selectedOption.optionText,
                displayOrder: selectedOption.displayOrder,
              }
            : null,
          userAnswerText: answer.userAnswerText,
          correctAnswer: this.answerGradingService.correctAnswer(question),
          explanation:
            question.answerExplanation ?? selectedOption?.explanation ?? null,
          isCorrect: answer.isCorrect === true,
          points: question.points,
          earnedPoints: answer.isCorrect ? question.points : 0,
          answeredAt: answer.answeredAt,
        },
      ];
    });
    return {
      result: this.calculateResult(resultQuestions, session.completedAt),
      answers,
    };
  }

  async getDueRecommendations(
    userId: string,
    query: GetDueReviewsQueryDto,
    now: Date,
  ) {
    const articleFilter = query.articleId
      ? Prisma.sql`AND article.id = ${query.articleId}::uuid`
      : Prisma.empty;
    const quizArticleFilter = query.articleId
      ? Prisma.sql`AND quiz.article_id = ${query.articleId}::uuid`
      : Prisma.empty;
    const duePredicate = Prisma.sql`
      uv.user_id = ${userId}::uuid
      AND uv.learning_status IN (
        ${LearningStatus.NEW}::learning_status,
        ${LearningStatus.LEARNING}::learning_status,
        ${LearningStatus.REVIEWING}::learning_status
      )
      AND (
        uv.next_review_at <= ${now}
        OR (
          uv.learning_status = ${LearningStatus.NEW}::learning_status
          AND uv.next_review_at IS NULL
        )
      )
    `;
    const [countRows, recommendedQuizzes] = await Promise.all([
      this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(DISTINCT uv.id)::int AS count
        FROM user_vocabularies uv
        JOIN article_sentence_terms term
          ON term.id = uv.article_sentence_term_id
        JOIN article_sentences sentence ON sentence.id = term.sentence_id
        JOIN articles article ON article.id = sentence.article_id
        WHERE ${duePredicate} ${articleFilter}
      `),
      this.prisma.$queryRaw<RawDueQuiz[]>(Prisma.sql`
        WITH due_vocabulary AS (
          SELECT DISTINCT uv.id, uv.article_sentence_term_id
          FROM user_vocabularies uv
          JOIN article_sentence_terms term
            ON term.id = uv.article_sentence_term_id
          JOIN article_sentences sentence ON sentence.id = term.sentence_id
          JOIN articles article ON article.id = sentence.article_id
          WHERE ${duePredicate} ${articleFilter}
        )
        SELECT
          quiz.id,
          quiz.title,
          quiz.description,
          quiz.published_at AS "publishedAt",
          article.id AS "articleId",
          article.title AS "articleTitle",
          article.slug AS "articleSlug",
          article.thumbnail_url AS "articleThumbnailUrl",
          COUNT(DISTINCT due.id)::int AS "matchingDueVocabularyCount",
          (
            SELECT COUNT(*)::int
            FROM quiz_questions active_question
            WHERE active_question.quiz_id = quiz.id
              AND active_question.is_active = true
          ) AS "activeQuestionCount",
          (
            SELECT COALESCE(SUM(active_question.points), 0)::int
            FROM quiz_questions active_question
            WHERE active_question.quiz_id = quiz.id
              AND active_question.is_active = true
          ) AS "totalPoints"
        FROM quizzes quiz
        JOIN articles article ON article.id = quiz.article_id
        JOIN quiz_questions question
          ON question.quiz_id = quiz.id AND question.is_active = true
        JOIN due_vocabulary due
          ON due.article_sentence_term_id = question.article_vocabulary_id
        WHERE quiz.status = ${QuizStatus.PUBLISHED}::quiz_status
          AND article.status = ${ArticleStatus.PUBLISHED}::article_status
          ${quizArticleFilter}
        GROUP BY quiz.id, article.id
        ORDER BY
          COUNT(DISTINCT due.id) DESC,
          quiz.published_at DESC NULLS LAST,
          quiz.id ASC
        LIMIT ${query.limit}
      `),
    ]);

    return {
      dueVocabularyCount: countRows[0]?.count ?? 0,
      recommendedQuizzes: recommendedQuizzes.map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        publishedAt: quiz.publishedAt,
        matchingDueVocabularyCount: quiz.matchingDueVocabularyCount,
        activeQuestionCount: quiz.activeQuestionCount,
        totalPoints: quiz.totalPoints,
        article: {
          id: quiz.articleId,
          title: quiz.articleTitle,
          slug: quiz.articleSlug,
          thumbnailUrl: quiz.articleThumbnailUrl,
        },
      })),
    };
  }

  private calculateResult(
    questions: ResultQuestion[],
    completedAt: Date,
  ): QuizResult {
    const aggregates = this.calculateAggregates(questions);
    return {
      score: aggregates.score,
      totalPoints: aggregates.totalPoints,
      accuracy: aggregates.accuracy,
      correctCount: aggregates.correctCount,
      completedAt,
    };
  }

  private calculateAggregates(questions: ResultQuestion[]) {
    const answered = questions.filter(
      ({ reviewAnswers }) => reviewAnswers.length > 0,
    );
    const correct = answered.filter(
      ({ reviewAnswers }) => reviewAnswers[0]?.isCorrect === true,
    );
    const score = correct.reduce((sum, { points }) => sum + points, 0);
    const totalPoints = questions.reduce((sum, { points }) => sum + points, 0);
    return {
      answeredCount: answered.length,
      correctCount: correct.length,
      score,
      totalPoints,
      accuracy:
        questions.length === 0
          ? 0
          : Math.round((correct.length / questions.length) * 10_000) / 10_000,
    };
  }

  private mapSafeQuestion(question: {
    id: string;
    questionType: GradingQuestion['questionType'];
    prompt: string;
    blankSentence: string | null;
    points: number;
    displayOrder: number;
    options: Array<{
      id: string;
      optionText: string;
      displayOrder: number;
    }>;
  }) {
    return {
      id: question.id,
      questionType: question.questionType,
      prompt: question.prompt,
      blankSentence: question.blankSentence,
      points: question.points,
      displayOrder: question.displayOrder,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.optionText,
        displayOrder: option.displayOrder,
      })),
    };
  }

  private async withSerializableRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (!this.hasPrismaCode(error, 'P2034')) throw error;
        if (attempt === MAX_SERIALIZABLE_ATTEMPTS) {
          throw new ReviewConcurrencyConflictError();
        }
      }
    }
    throw new ReviewConcurrencyConflictError();
  }

  private hasPrismaCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }
}

export { InvalidAnswerRelationshipError, InvalidAnswerShapeError };
