import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import {
  ArticleStatus,
  LearningStatus,
  QuestionGenerationSource,
  QuestionType,
  QuizStatus,
  ReviewSessionItemStatus,
  ReviewSessionStatus,
  ReviewSessionType,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import type {
  GetDueReviewsQueryDto,
  GetReviewHistoryQueryDto,
  SkipReviewSessionItemDto,
  StartReviewSessionDto,
  SubmitReviewAnswerDto,
} from './dto/review-request.dto';
import {
  AnswerGradingService,
  InvalidAnswerRelationshipError,
  InvalidAnswerShapeError,
  type GradingQuestion,
} from './services/answer-grading.service';
import { InvisibleReviewScoringService } from './services/invisible-review-scoring.service';
import {
  QuestionSelectionService,
  RECENT_ACCURACY_WINDOW,
  type RecentQuestionAttempt,
} from './services/question-selection.service';
import {
  RuleBasedQuestionGeneratorService,
  type GeneratedQuestionSpec,
  type VocabularyQuestionSnapshot,
} from './services/rule-based-question-generator.service';

export class ReviewResourceNotFoundError extends Error {}
export class ReviewSessionStateConflictError extends Error {}
export class ReviewConcurrencyConflictError extends Error {}
export class InvalidReviewSourceShapeError extends Error {}
export class ReviewSubmissionConflictError extends Error {}

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_RETRY_COUNT = 1;

const sessionSelect = {
  id: true,
  sessionType: true,
  quizId: true,
  articleId: true,
  collectionId: true,
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
  articleSentenceTermId: true,
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
  articleSentenceTermId: true,
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

const reviewVocabularySelect = {
  id: true,
  userId: true,
  articleSentenceTermId: true,
  learningStatus: true,
  savedWordDisplay: true,
  savedLemma: true,
  savedPartOfSpeech: true,
  savedMeaningVi: true,
  savedContextSentence: true,
  savedExplanation: true,
  savedCefrLevel: true,
  savedAt: true,
  nextReviewAt: true,
  reviewIntervalDays: true,
  consecutiveCorrectReviews: true,
  lapseCount: true,
  lastReviewScore: true,
  articleSentenceTerm: {
    select: {
      sentence: {
        select: {
          article: {
            select: {
              categoryId: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserVocabularySelect;

type ReviewVocabulary = Prisma.UserVocabularyGetPayload<{
  select: typeof reviewVocabularySelect;
}>;

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

interface ValidatedReviewSource {
  quizId: string | null;
  articleId: string | null;
  collectionId: string | null;
  termIds?: string[];
}

export interface AiQuestionGenerationCandidate {
  vocabulary: VocabularyQuestionSnapshot;
  questionTypes: QuestionType[];
}

@Injectable()
export class ReviewsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly answerGradingService: AnswerGradingService,
    private readonly reviewScoringService: InvisibleReviewScoringService,
    private readonly questionSelectionService: QuestionSelectionService,
    private readonly questionGeneratorService: RuleBasedQuestionGeneratorService,
  ) {}

  getAiQuestionGenerationCandidates(
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
  ): Promise<AiQuestionGenerationCandidate[]> {
    if (dto.sessionType === ReviewSessionType.QUIZ) return Promise.resolve([]);

    return this.prisma.$transaction(async (tx) => {
      this.assertSourceShape(dto);
      const active = await tx.reviewSession.findFirst({
        where: {
          userId,
          sessionType: dto.sessionType,
          ...(dto.sessionType === ReviewSessionType.ARTICLE_REVIEW
            ? { articleId: dto.articleId }
            : {}),
          ...(dto.sessionType === ReviewSessionType.COLLECTION_REVIEW
            ? { collectionId: dto.collectionId }
            : {}),
          status: ReviewSessionStatus.IN_PROGRESS,
        },
        select: { id: true },
      });
      if (active) return [];

      const source = await this.validateSource(tx, userId, dto);
      const vocabularies = await this.findEligibleVocabularies(
        tx,
        userId,
        dto,
        source.termIds,
        now,
      );
      const history = await this.loadRecentAttemptHistory(tx, vocabularies);

      return vocabularies.map((vocabulary) => {
        const preferredTypes = this.questionSelectionService.preferredTypes(
          vocabulary,
          history.get(vocabulary.id) ?? [],
        );
        return {
          vocabulary: this.toQuestionSnapshot(vocabulary),
          questionTypes: preferredTypes.slice(
            0,
            vocabulary.lapseCount >= 2 ? 2 : 1,
          ),
        };
      });
    });
  }

  findCachedAiQuestion(
    articleSentenceTermId: string,
    difficultyCefr: ReviewVocabulary['savedCefrLevel'],
    questionType: QuestionType,
  ) {
    return this.prisma.quizQuestion.findFirst({
      where: {
        quizId: null,
        articleSentenceTermId,
        difficultyCefr,
        questionType,
        generationSource: QuestionGenerationSource.AI,
        isActive: true,
      },
      select: { id: true },
    });
  }

  async cacheAiQuestion(spec: GeneratedQuestionSpec) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cached = await tx.quizQuestion.findFirst({
          where: {
            quizId: null,
            articleSentenceTermId: spec.articleSentenceTermId,
            difficultyCefr: spec.difficultyCefr,
            questionType: spec.questionType,
            generationSource: QuestionGenerationSource.AI,
            isActive: true,
          },
          select: { id: true },
        });
        if (cached) return cached;

        const { options, ...question } = spec;
        return tx.quizQuestion.create({
          data: {
            ...question,
            options: {
              create: options.map((option) => ({
                ...option,
                generationSource: QuestionGenerationSource.AI,
              })),
            },
          },
          select: { id: true },
        });
      });
    } catch (error: unknown) {
      if (!this.hasPrismaCode(error, 'P2002')) throw error;
      const cached = await this.findCachedAiQuestion(
        spec.articleSentenceTermId,
        spec.difficultyCefr,
        spec.questionType,
      );
      if (!cached) throw error;
      return cached;
    }
  }

  startSession(userId: string, dto: StartReviewSessionDto, now: Date) {
    return this.withSerializableRetry(async (tx) => {
      this.assertSourceShape(dto);
      const active = await tx.reviewSession.findFirst({
        where: {
          userId,
          sessionType: dto.sessionType,
          ...(dto.sessionType === ReviewSessionType.QUIZ
            ? { quizId: dto.quizId }
            : {}),
          ...(dto.sessionType === ReviewSessionType.ARTICLE_REVIEW
            ? { articleId: dto.articleId }
            : {}),
          ...(dto.sessionType === ReviewSessionType.COLLECTION_REVIEW
            ? { collectionId: dto.collectionId }
            : {}),
          status: ReviewSessionStatus.IN_PROGRESS,
        },
        select: sessionSelect,
      });
      if (active) {
        return this.getSessionStateWithClient(tx, active);
      }
      const source = await this.validateSource(tx, userId, dto);

      const vocabularies = await this.findEligibleVocabularies(
        tx,
        userId,
        dto,
        source.termIds,
        now,
      );
      if (vocabularies.length === 0) return null;

      const assignedQuestions = await this.assignInitialQuestions(
        tx,
        userId,
        vocabularies,
        source.quizId,
      );

      const session = await tx.reviewSession.create({
        data: {
          userId,
          sessionType: dto.sessionType,
          quizId: source.quizId,
          articleId: source.articleId,
          collectionId: source.collectionId,
          status: ReviewSessionStatus.IN_PROGRESS,
          completedAt: null,
        },
        select: sessionSelect,
      });
      await tx.reviewSessionItem.createMany({
        data: vocabularies.map((vocabulary, index) => ({
          reviewSessionId: session.id,
          userVocabularyId: vocabulary.id,
          quizQuestionId: assignedQuestions[index].id,
          sequenceNumber: index + 1,
          status: ReviewSessionItemStatus.PENDING,
        })),
      });
      return this.getSessionStateWithClient(tx, session);
    }, true);
  }

  async getSessionState(userId: string, sessionId: string) {
    const session = await this.prisma.reviewSession.findFirst({
      where: { id: sessionId, userId },
      select: sessionSelect,
    });
    if (!session) return null;
    return this.getSessionStateWithClient(this.prisma, session);
  }

  async getActiveSessionState(userId: string) {
    const session = await this.prisma.reviewSession.findFirst({
      where: { userId, status: ReviewSessionStatus.IN_PROGRESS },
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      select: sessionSelect,
    });
    if (!session) return null;
    return this.getSessionStateWithClient(this.prisma, session);
  }

  submitAnswer(userId: string, sessionId: string, dto: SubmitReviewAnswerDto) {
    return this.withSerializableRetry(async (tx) => {
      const session = await tx.reviewSession.findFirst({
        where: { id: sessionId, userId },
        select: sessionSelect,
      });
      if (!session) throw new ReviewResourceNotFoundError();
      if (session.status !== ReviewSessionStatus.IN_PROGRESS) {
        throw new ReviewSessionStateConflictError();
      }

      const item = await tx.reviewSessionItem.findFirst({
        where: {
          reviewSessionId: session.id,
          status: ReviewSessionItemStatus.PENDING,
        },
        orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          userVocabularyId: true,
          retryCount: true,
          sequenceNumber: true,
          _count: { select: { answers: true } },
          quizQuestion: { select: gradingQuestionSelect },
        },
      });
      if (!item) throw new ReviewSubmissionConflictError();
      const question = item.quizQuestion;
      if (
        item.id !== dto.reviewSessionItemId ||
        question.id !== dto.quizQuestionId ||
        item._count.answers !== item.retryCount ||
        item.retryCount > MAX_RETRY_COUNT
      ) {
        throw new ReviewSubmissionConflictError();
      }

      const grading = this.answerGradingService.grade(question, {
        ...(dto.selectedOptionId === undefined
          ? {}
          : { selectedOptionId: dto.selectedOptionId }),
        ...(dto.userAnswerText === undefined
          ? {}
          : { userAnswerText: dto.userAnswerText }),
      });
      const vocabulary = item.userVocabularyId
        ? await tx.userVocabulary.findUnique({
            where: { id: item.userVocabularyId },
            select: reviewVocabularySelect,
          })
        : null;
      const now = new Date();
      const inferredScore = this.reviewScoringService.inferScore({
        isCorrect: grading.isCorrect,
        previousFailedAttempts: item.retryCount,
        hintsUsed: dto.hintsUsed ?? 0,
        questionType: question.questionType,
        responseTimeMs: dto.responseTimeMs ?? null,
      });
      let answer: { id: string };
      try {
        answer = await tx.reviewAnswer.create({
          data: {
            reviewSessionItemId: item.id,
            quizQuestionId: question.id,
            selectedOptionId: grading.selectedOptionId,
            userAnswerText: dto.userAnswerText ?? null,
            isCorrect: grading.isCorrect,
            responseTimeMs: dto.responseTimeMs ?? null,
            attemptNumber: item._count.answers + 1,
            hintsUsed: dto.hintsUsed ?? 0,
            inferredReviewScore: inferredScore,
            answeredAt: now,
          },
          select: { id: true },
        });
      } catch (error: unknown) {
        if (this.hasPrismaCode(error, 'P2002')) {
          throw new ReviewSubmissionConflictError();
        }
        throw error;
      }
      const shouldRetry =
        !grading.isCorrect && item.retryCount < MAX_RETRY_COUNT;
      const retryQuestion = shouldRetry
        ? await this.assignRetryQuestion(
            tx,
            vocabulary,
            question.questionType,
            session.quizId,
          )
        : null;
      const completed = grading.isCorrect || !shouldRetry;
      const nextSequence = shouldRetry
        ? ((
            await tx.reviewSessionItem.aggregate({
              where: { reviewSessionId: session.id },
              _max: { sequenceNumber: true },
            })
          )._max.sequenceNumber ?? item.sequenceNumber)
        : item.sequenceNumber;
      await tx.reviewSessionItem.update({
        where: { id: item.id },
        data: {
          status: completed
            ? ReviewSessionItemStatus.COMPLETED
            : ReviewSessionItemStatus.PENDING,
          retryCount: shouldRetry ? item.retryCount + 1 : item.retryCount,
          finalInferredScore: completed ? inferredScore : null,
          completedAt: completed ? now : null,
          ...(retryQuestion
            ? {
                quizQuestionId: retryQuestion.id,
                sequenceNumber: nextSequence + 1,
              }
            : {}),
        },
        select: { id: true },
      });

      if (vocabulary && shouldRetry) {
        await tx.userVocabulary.update({
          where: { id: vocabulary.id },
          data: this.reviewScoringService.schedule(0, vocabulary, now, true),
          select: { id: true },
        });
      } else if (vocabulary && completed) {
        await tx.userVocabulary.update({
          where: { id: vocabulary.id },
          data: this.reviewScoringService.schedule(
            inferredScore,
            vocabulary,
            now,
            false,
          ),
          select: { id: true },
        });
      }

      const pendingCount = await tx.reviewSessionItem.count({
        where: {
          reviewSessionId: session.id,
          status: ReviewSessionItemStatus.PENDING,
        },
      });
      const sessionCompleted = pendingCount === 0;
      const currentSession = sessionCompleted
        ? await tx.reviewSession.update({
            where: { id: session.id },
            data: {
              status: ReviewSessionStatus.COMPLETED,
              completedAt: now,
            },
            select: sessionSelect,
          })
        : session;
      const state = await this.getSessionStateWithClient(tx, currentSession);
      const completionSummary = sessionCompleted
        ? await this.getCompletionSummaryWithClient(
            tx,
            session.id,
            currentSession.completedAt ?? now,
          )
        : undefined;

      return {
        answerId: answer.id,
        isCorrect: grading.isCorrect,
        correctAnswer: grading.correctAnswer,
        explanation: grading.explanation,
        earnedPoints: grading.earnedPoints,
        inferredReviewScore: inferredScore,
        willReturnLater: shouldRetry,
        sessionCompleted,
        ...(completionSummary ? { completionSummary } : {}),
        ...state,
      };
    });
  }

  skipItem(userId: string, sessionId: string, dto: SkipReviewSessionItemDto) {
    return this.withSerializableRetry(async (tx) => {
      const session = await tx.reviewSession.findFirst({
        where: { id: sessionId, userId },
        select: sessionSelect,
      });
      if (!session) throw new ReviewResourceNotFoundError();
      if (session.status !== ReviewSessionStatus.IN_PROGRESS) {
        throw new ReviewSessionStateConflictError();
      }

      const item = await tx.reviewSessionItem.findFirst({
        where: {
          reviewSessionId: session.id,
          status: ReviewSessionItemStatus.PENDING,
        },
        orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          userVocabularyId: true,
          retryCount: true,
          _count: { select: { answers: true } },
          quizQuestion: { select: { id: true } },
        },
      });
      if (
        !item ||
        item.id !== dto.reviewSessionItemId ||
        item.quizQuestion.id !== dto.quizQuestionId ||
        item._count.answers !== item.retryCount ||
        item.retryCount > MAX_RETRY_COUNT
      ) {
        throw new ReviewSubmissionConflictError();
      }

      const vocabulary = item.userVocabularyId
        ? await tx.userVocabulary.findUnique({
            where: { id: item.userVocabularyId },
            select: reviewVocabularySelect,
          })
        : null;
      const now = new Date();
      await tx.reviewSessionItem.update({
        where: { id: item.id },
        data: {
          status: ReviewSessionItemStatus.SKIPPED,
          finalInferredScore: 0,
          completedAt: now,
        },
        select: { id: true },
      });
      if (vocabulary) {
        await tx.userVocabulary.update({
          where: { id: vocabulary.id },
          data: this.reviewScoringService.schedule(
            0,
            vocabulary,
            now,
            item.retryCount === 0,
          ),
          select: { id: true },
        });
      }

      const pendingCount = await tx.reviewSessionItem.count({
        where: {
          reviewSessionId: session.id,
          status: ReviewSessionItemStatus.PENDING,
        },
      });
      const sessionCompleted = pendingCount === 0;
      const currentSession = sessionCompleted
        ? await tx.reviewSession.update({
            where: { id: session.id },
            data: {
              status: ReviewSessionStatus.COMPLETED,
              completedAt: now,
            },
            select: sessionSelect,
          })
        : session;
      const state = await this.getSessionStateWithClient(tx, currentSession);
      const completionSummary = sessionCompleted
        ? await this.getCompletionSummaryWithClient(
            tx,
            session.id,
            currentSession.completedAt ?? now,
          )
        : undefined;

      return {
        inferredReviewScore: 0,
        sessionCompleted,
        ...(completionSummary ? { completionSummary } : {}),
        ...state,
      };
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
          items: {
            orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
            select: {
              quizQuestion: { select: { points: true } },
              answers: {
                orderBy: [{ attemptNumber: 'desc' }, { answeredAt: 'desc' }],
                take: 1,
                select: { isCorrect: true },
              },
            },
          },
        },
      }),
      this.prisma.reviewSession.count({ where }),
    ]);

    return {
      items: rows.map((row) => {
        const questions = row.items.map(({ quizQuestion, answers }) => ({
          points: quizQuestion.points,
          reviewAnswers: answers,
        }));
        return {
          session: {
            id: row.id,
            sessionType: row.sessionType,
            quizId: row.quizId,
            articleId: row.articleId,
            collectionId: row.collectionId,
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
        items: {
          orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
          select: {
            quizQuestion: {
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
              },
            },
            answers: {
              orderBy: [
                { attemptNumber: 'desc' },
                { answeredAt: 'desc' },
                { id: 'asc' },
              ],
              take: 1,
              select: {
                selectedOptionId: true,
                userAnswerText: true,
                isCorrect: true,
                answeredAt: true,
                quizQuestion: {
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
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!session) return null;
    if (
      session.status !== ReviewSessionStatus.COMPLETED ||
      !session.completedAt
    ) {
      throw new ReviewSessionStateConflictError();
    }
    const resultQuestions = session.items.map(({ quizQuestion, answers }) => ({
      points: answers[0]?.quizQuestion.points ?? quizQuestion.points,
      reviewAnswers: answers.map(({ isCorrect }) => ({
        isCorrect,
      })),
    }));
    const answers = session.items.flatMap(({ answers }) => {
      const answer = answers[0];
      if (!answer) return [];
      const question = answer.quizQuestion;
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
          ON due.article_sentence_term_id = question.article_sentence_term_id
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

  private async validateSource(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: StartReviewSessionDto,
  ): Promise<ValidatedReviewSource> {
    this.assertSourceShape(dto);

    if (dto.sessionType === ReviewSessionType.QUIZ) {
      const quiz = await tx.quiz.findFirst({
        where: {
          id: dto.quizId!,
          status: QuizStatus.PUBLISHED,
          article: { is: { status: ArticleStatus.PUBLISHED } },
          questions: { some: { isActive: true } },
        },
        select: {
          id: true,
          articleId: true,
          questions: {
            where: { isActive: true },
            select: { articleSentenceTermId: true },
          },
        },
      });
      if (!quiz) throw new ReviewResourceNotFoundError();
      return {
        quizId: quiz.id,
        articleId: quiz.articleId,
        collectionId: null,
        termIds: [
          ...new Set(
            quiz.questions.map(
              ({ articleSentenceTermId }) => articleSentenceTermId,
            ),
          ),
        ],
      };
    }

    if (dto.sessionType === ReviewSessionType.ARTICLE_REVIEW) {
      const article = await tx.article.findFirst({
        where: { id: dto.articleId!, status: ArticleStatus.PUBLISHED },
        select: { id: true },
      });
      if (!article) throw new ReviewResourceNotFoundError();
      return { quizId: null, articleId: article.id, collectionId: null };
    }

    if (dto.sessionType === ReviewSessionType.COLLECTION_REVIEW) {
      const collection = await tx.vocabularyCollection.findFirst({
        where: { id: dto.collectionId!, userId },
        select: { id: true },
      });
      if (!collection) throw new ReviewResourceNotFoundError();
      return { quizId: null, articleId: null, collectionId: collection.id };
    }

    return { quizId: null, articleId: null, collectionId: null };
  }

  private assertSourceShape(dto: StartReviewSessionDto): void {
    const hasUnexpectedSource =
      (dto.sessionType !== ReviewSessionType.QUIZ && dto.quizId != null) ||
      (dto.sessionType !== ReviewSessionType.ARTICLE_REVIEW &&
        dto.articleId != null) ||
      (dto.sessionType !== ReviewSessionType.COLLECTION_REVIEW &&
        dto.collectionId != null);
    const missingSource =
      (dto.sessionType === ReviewSessionType.QUIZ && !dto.quizId) ||
      (dto.sessionType === ReviewSessionType.ARTICLE_REVIEW &&
        !dto.articleId) ||
      (dto.sessionType === ReviewSessionType.COLLECTION_REVIEW &&
        !dto.collectionId);
    if (hasUnexpectedSource || missingSource) {
      throw new InvalidReviewSourceShapeError();
    }
  }

  private async findEligibleVocabularies(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: StartReviewSessionDto,
    termIds: string[] | undefined,
    now: Date,
  ): Promise<ReviewVocabulary[]> {
    const sourceWhere: Prisma.UserVocabularyWhereInput =
      dto.sessionType === ReviewSessionType.QUIZ
        ? { articleSentenceTermId: { in: termIds ?? [] } }
        : dto.sessionType === ReviewSessionType.ARTICLE_REVIEW
          ? {
              articleSentenceTerm: {
                is: { sentence: { is: { articleId: dto.articleId! } } },
              },
            }
          : dto.sessionType === ReviewSessionType.COLLECTION_REVIEW
            ? {
                collectionItems: { some: { collectionId: dto.collectionId! } },
              }
            : {};
    const commonWhere: Prisma.UserVocabularyWhereInput = {
      userId,
      learningStatus: {
        in: [
          LearningStatus.NEW,
          LearningStatus.LEARNING,
          LearningStatus.REVIEWING,
        ],
      },
      ...sourceWhere,
    };
    const selected: ReviewVocabulary[] = [];
    const take = async (
      where: Prisma.UserVocabularyWhereInput,
      orderBy: Prisma.UserVocabularyOrderByWithRelationInput[],
    ) => {
      const remaining = dto.limit - selected.length;
      if (remaining <= 0) return;
      selected.push(
        ...(await tx.userVocabulary.findMany({
          where: { ...commonWhere, ...where },
          take: remaining,
          orderBy,
          select: reviewVocabularySelect,
        })),
      );
    };

    await take({ nextReviewAt: { lte: now } }, [
      { lapseCount: 'desc' },
      { nextReviewAt: 'asc' },
      { savedAt: 'asc' },
      { id: 'asc' },
    ]);
    await take(
      {
        nextReviewAt: null,
        learningStatus: {
          in: [LearningStatus.LEARNING, LearningStatus.REVIEWING],
        },
      },
      [{ lapseCount: 'desc' }, { savedAt: 'asc' }, { id: 'asc' }],
    );
    await take({ nextReviewAt: null, learningStatus: LearningStatus.NEW }, [
      { lapseCount: 'desc' },
      { savedAt: 'asc' },
      { id: 'asc' },
    ]);
    return selected;
  }

  private async assignInitialQuestions(
    tx: Prisma.TransactionClient,
    userId: string,
    vocabularies: ReviewVocabulary[],
    quizId: string | null,
  ) {
    const history = await this.loadRecentAttemptHistory(tx, vocabularies);
    const preferences = vocabularies.map((vocabulary) => ({
      vocabulary,
      preferredTypes: this.questionSelectionService.preferredTypes(
        vocabulary,
        history.get(vocabulary.id) ?? [],
      ),
    }));

    if (quizId) {
      const questions = await tx.quizQuestion.findMany({
        where: {
          quizId,
          isActive: true,
          articleSentenceTermId: {
            in: vocabularies.map(
              ({ articleSentenceTermId }) => articleSentenceTermId,
            ),
          },
        },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          articleSentenceTermId: true,
          questionType: true,
        },
      });
      return preferences.map(({ vocabulary, preferredTypes }) => {
        const candidates = questions.filter(
          ({ articleSentenceTermId }) =>
            articleSentenceTermId === vocabulary.articleSentenceTermId,
        );
        const selected = this.selectExistingQuestion(
          candidates,
          preferredTypes,
        );
        if (!selected) throw new ReviewResourceNotFoundError();
        return selected;
      });
    }

    return this.resolveGeneratedQuestions(tx, userId, preferences);
  }

  private async assignRetryQuestion(
    tx: Prisma.TransactionClient,
    vocabulary: ReviewVocabulary | null,
    previousType: QuestionType,
    quizId: string | null,
  ) {
    if (!vocabulary) throw new ReviewResourceNotFoundError();
    const history = await this.loadRecentAttemptHistory(tx, [vocabulary]);
    const preferredTypes = this.questionSelectionService.preferredTypes(
      vocabulary,
      history.get(vocabulary.id) ?? [],
      previousType,
    );
    if (quizId) {
      const questions = await tx.quizQuestion.findMany({
        where: {
          quizId,
          articleSentenceTermId: vocabulary.articleSentenceTermId,
          isActive: true,
          questionType: { not: previousType },
        },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, articleSentenceTermId: true, questionType: true },
      });
      const selected = this.selectExistingQuestion(questions, preferredTypes);
      if (selected) return selected;
    }

    const generated = await this.resolveGeneratedQuestions(
      tx,
      vocabulary.userId,
      [{ vocabulary, preferredTypes }],
    );
    const selected = generated[0];
    if (!selected || selected.questionType === previousType) {
      throw new ReviewResourceNotFoundError();
    }
    return selected;
  }

  private async resolveGeneratedQuestions(
    tx: Prisma.TransactionClient,
    userId: string,
    assignments: Array<{
      vocabulary: ReviewVocabulary;
      preferredTypes: QuestionType[];
    }>,
  ) {
    const vocabularies = assignments.map(({ vocabulary }) => vocabulary);
    const pool = await this.loadQuestionPool(tx, userId, vocabularies);
    const termIds = vocabularies.map(
      ({ articleSentenceTermId }) => articleSentenceTermId,
    );
    const cached = await tx.quizQuestion.findMany({
      where: {
        quizId: null,
        generationSource: {
          in: [
            QuestionGenerationSource.AI,
            QuestionGenerationSource.RULE_BASED,
          ],
        },
        isActive: true,
        articleSentenceTermId: { in: termIds },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        articleSentenceTermId: true,
        questionType: true,
        generationSource: true,
        difficultyCefr: true,
        prompt: true,
        blankSentence: true,
        correctAnswerText: true,
        answerExplanation: true,
        isCaseSensitive: true,
        points: true,
        options: {
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: {
            optionText: true,
            isCorrect: true,
            explanation: true,
            displayOrder: true,
          },
        },
      },
    });

    const selected = new Map<
      string,
      { id: string; articleSentenceTermId: string; questionType: QuestionType }
    >();
    const specsToCreate: GeneratedQuestionSpec[] = [];
    for (const { vocabulary, preferredTypes } of assignments) {
      const snapshot = this.toQuestionSnapshot(vocabulary);
      const aiCached = preferredTypes.flatMap((questionType) => {
        const match = cached.find(
          (question) =>
            question.generationSource === QuestionGenerationSource.AI &&
            question.articleSentenceTermId ===
              vocabulary.articleSentenceTermId &&
            question.difficultyCefr === vocabulary.savedCefrLevel &&
            question.questionType === questionType,
        );
        return match ? [match] : [];
      })[0];
      if (aiCached) {
        selected.set(vocabulary.id, aiCached);
        continue;
      }
      const generated = preferredTypes.flatMap((questionType) => {
        const spec = this.questionGeneratorService.generate(
          snapshot,
          questionType,
          pool,
        );
        return spec ? [spec] : [];
      });
      const reusable = generated.flatMap((spec) => {
        const match = cached.find(
          (question) =>
            question.generationSource === QuestionGenerationSource.RULE_BASED &&
            question.articleSentenceTermId ===
              vocabulary.articleSentenceTermId &&
            question.questionType === spec.questionType &&
            this.questionGeneratorService.canReuseCache(
              question,
              snapshot,
              spec.questionType,
              pool,
            ),
        );
        return match ? [match] : [];
      })[0];
      if (reusable) {
        selected.set(vocabulary.id, reusable);
        continue;
      }
      const spec = generated[0];
      if (!spec) throw new ReviewResourceNotFoundError();
      specsToCreate.push(spec);
    }

    if (specsToCreate.length > 0) {
      const created = await tx.quizQuestion.createManyAndReturn({
        data: specsToCreate.map(({ options: _options, ...question }) => {
          void _options;
          return question;
        }),
        select: {
          id: true,
          articleSentenceTermId: true,
          questionType: true,
        },
      });
      const createdByKey = new Map(
        created.map((question) => [
          `${question.articleSentenceTermId}:${question.questionType}`,
          question,
        ]),
      );
      const options = specsToCreate.flatMap((spec) => {
        const question = createdByKey.get(
          `${spec.articleSentenceTermId}:${spec.questionType}`,
        );
        if (!question) throw new ReviewResourceNotFoundError();
        return spec.options.map((option) => ({
          quizQuestionId: question.id,
          generationSource: QuestionGenerationSource.RULE_BASED,
          ...option,
        }));
      });
      if (options.length > 0) {
        await tx.questionOption.createMany({ data: options });
      }
      for (const { vocabulary } of assignments) {
        if (selected.has(vocabulary.id)) continue;
        const createdQuestion = created.find(
          ({ articleSentenceTermId }) =>
            articleSentenceTermId === vocabulary.articleSentenceTermId,
        );
        if (!createdQuestion) throw new ReviewResourceNotFoundError();
        selected.set(vocabulary.id, createdQuestion);
      }
    }

    return assignments.map(({ vocabulary }) => {
      const question = selected.get(vocabulary.id);
      if (!question) throw new ReviewResourceNotFoundError();
      return question;
    });
  }

  private async loadQuestionPool(
    tx: Prisma.TransactionClient,
    userId: string,
    selected: ReviewVocabulary[],
  ): Promise<VocabularyQuestionSnapshot[]> {
    const cefrLevels = [
      ...new Set(selected.map(({ savedCefrLevel }) => savedCefrLevel)),
    ];
    const categoryIds = [
      ...new Set(
        selected.map(
          ({ articleSentenceTerm }) =>
            articleSentenceTerm.sentence.article.categoryId,
        ),
      ),
    ];
    const extra = await tx.userVocabulary.findMany({
      where: {
        userId,
        id: { notIn: selected.map(({ id }) => id) },
        OR: [
          { savedCefrLevel: { in: cefrLevels } },
          {
            articleSentenceTerm: {
              is: {
                sentence: {
                  is: { article: { is: { categoryId: { in: categoryIds } } } },
                },
              },
            },
          },
        ],
      },
      orderBy: [{ savedAt: 'desc' }, { id: 'asc' }],
      take: 200,
      select: reviewVocabularySelect,
    });
    return [...selected, ...extra].map((vocabulary) =>
      this.toQuestionSnapshot(vocabulary),
    );
  }

  private toQuestionSnapshot(
    vocabulary: ReviewVocabulary,
  ): VocabularyQuestionSnapshot {
    return {
      id: vocabulary.id,
      articleSentenceTermId: vocabulary.articleSentenceTermId,
      savedWordDisplay: vocabulary.savedWordDisplay,
      savedLemma: vocabulary.savedLemma,
      savedPartOfSpeech: vocabulary.savedPartOfSpeech,
      savedCefrLevel: vocabulary.savedCefrLevel,
      savedContextSentence: vocabulary.savedContextSentence,
      savedMeaningVi: vocabulary.savedMeaningVi,
      savedExplanation: vocabulary.savedExplanation,
      categoryId: vocabulary.articleSentenceTerm.sentence.article.categoryId,
      articleTopic:
        vocabulary.articleSentenceTerm.sentence.article.category?.name,
    };
  }

  private async loadRecentAttemptHistory(
    tx: Prisma.TransactionClient,
    vocabularies: ReviewVocabulary[],
  ): Promise<Map<string, RecentQuestionAttempt[]>> {
    if (vocabularies.length === 0) return new Map();
    const vocabularyIds = Prisma.join(
      vocabularies.map(({ id }) => Prisma.sql`${id}::uuid`),
    );
    const rows = await tx.$queryRaw<
      Array<{
        userVocabularyId: string;
        questionType: QuestionType;
        isCorrect: boolean;
      }>
    >(Prisma.sql`
      SELECT
        recent.user_vocabulary_id AS "userVocabularyId",
        recent.question_type AS "questionType",
        recent.is_correct AS "isCorrect"
      FROM (
        SELECT
          item.user_vocabulary_id,
          question.question_type,
          answer.is_correct,
          answer.answered_at,
          answer.id,
          ROW_NUMBER() OVER (
            PARTITION BY item.user_vocabulary_id
            ORDER BY answer.answered_at DESC, answer.id ASC
          ) AS recent_number
        FROM review_answers answer
        JOIN review_session_items item
          ON item.id = answer.review_session_item_id
        JOIN quiz_questions question ON question.id = answer.quiz_question_id
        WHERE item.user_vocabulary_id IN (${vocabularyIds})
          AND answer.is_correct IS NOT NULL
      ) recent
      WHERE recent.recent_number <= ${RECENT_ACCURACY_WINDOW}
      ORDER BY recent.user_vocabulary_id ASC, recent.recent_number ASC
    `);
    const history = new Map<string, RecentQuestionAttempt[]>();
    for (const row of rows) {
      const attempts = history.get(row.userVocabularyId) ?? [];
      attempts.push({
        questionType: row.questionType,
        isCorrect: row.isCorrect,
      });
      history.set(row.userVocabularyId, attempts);
    }
    return history;
  }

  private selectExistingQuestion<T extends { questionType: QuestionType }>(
    questions: T[],
    preferredTypes: QuestionType[],
  ): T | undefined {
    for (const questionType of preferredTypes) {
      const selected = questions.find(
        (question) => question.questionType === questionType,
      );
      if (selected) return selected;
    }
    return undefined;
  }

  private async getSessionStateWithClient(
    client: Prisma.TransactionClient,
    session: {
      id: string;
      sessionType: ReviewSessionType;
      quizId: string | null;
      articleId: string | null;
      collectionId: string | null;
      status: ReviewSessionStatus;
      startedAt: Date;
      completedAt: Date | null;
    },
  ) {
    const [totalQuestions, answeredCount, next] = await Promise.all([
      client.reviewSessionItem.count({
        where: { reviewSessionId: session.id },
      }),
      client.reviewSessionItem.count({
        where: {
          reviewSessionId: session.id,
          status: {
            in: [
              ReviewSessionItemStatus.COMPLETED,
              ReviewSessionItemStatus.SKIPPED,
            ],
          },
        },
      }),
      session.status === ReviewSessionStatus.IN_PROGRESS
        ? client.reviewSessionItem.findFirst({
            where: {
              reviewSessionId: session.id,
              status: ReviewSessionItemStatus.PENDING,
            },
            orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              userVocabularyId: true,
              retryCount: true,
              quizQuestion: { select: safeQuestionSelect },
            },
          })
        : Promise.resolve(null),
    ]);
    return {
      session,
      answeredCount,
      totalQuestions,
      nextItem: next?.userVocabularyId
        ? {
            id: next.id,
            userVocabularyId: next.userVocabularyId,
            attemptNumber: next.retryCount + 1,
            question: this.mapSafeQuestion(next.quizQuestion),
          }
        : undefined,
    };
  }

  private async getCompletionSummaryWithClient(
    client: Prisma.TransactionClient,
    sessionId: string,
    completedAt: Date,
  ): Promise<QuizResult> {
    const items = await client.reviewSessionItem.findMany({
      where: { reviewSessionId: sessionId },
      orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
      select: {
        quizQuestion: { select: { points: true } },
        answers: {
          orderBy: [
            { attemptNumber: 'desc' },
            { answeredAt: 'desc' },
            { id: 'asc' },
          ],
          take: 1,
          select: {
            isCorrect: true,
            quizQuestion: { select: { points: true } },
          },
        },
      },
    });
    return this.calculateResult(
      items.map(({ quizQuestion, answers }) => ({
        points: answers[0]?.quizQuestion.points ?? quizQuestion.points,
        reviewAnswers: answers.map(({ isCorrect }) => ({ isCorrect })),
      })),
      completedAt,
    );
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
    retryUniqueConflict = false,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        const retryable =
          this.hasPrismaCode(error, 'P2034') ||
          (retryUniqueConflict && this.hasPrismaCode(error, 'P2002'));
        if (!retryable) throw error;
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
