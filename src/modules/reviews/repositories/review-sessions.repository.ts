import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  type CefrLevel,
  LearningStatus,
  ReviewQuestionGenerationSource,
  QuestionType,
  ReviewAgentAction,
  ReviewDecisionKind,
  type ReviewDecisionSource,
  type ReviewGoal,
  type ReviewErrorType,
  ReviewSessionItemStatus,
  ReviewSessionStatus,
  ReviewSkillDimension,
} from '../../../../generated/prisma/enums';
import {
  REVIEW_QUESTION_PROMPT_VERSION,
  type DiagnoseReviewAnswerInput,
  type ReviewRetestAfterItems,
} from '../../ai/ai.contracts';
import { PrismaService } from '../../../database/prisma.service';
import type { ReturnTypeOfAppConfig } from '../../../config/app.config';
import { APP_CONFIG } from '../../../config/config.module';
import type {
  GetReviewHistoryQueryDto,
  SkipReviewSessionItemDto,
  StartReviewSessionDto,
  SubmitReviewAnswerDto,
} from '../dto/review-request.dto';
import {
  RECENT_ACCURACY_WINDOW,
  skillDimensionForQuestion,
} from '../services/question-selection';
import type {
  PreparedAiReviewQuestion,
  VocabularyQuestionSnapshot,
} from './review-questions.repository';
import { correctAnswerFor } from '../question-answer';
import {
  InvalidAnswerRelationshipError,
  InvalidAnswerShapeError,
  ReviewConcurrencyConflictError,
  ReviewResourceNotFoundError,
} from './review-errors';
import {
  reviewDayEnd,
  reviewEligibilitySql,
  reviewEligibilityWhere,
} from './review-eligibility';

export {
  ReviewConcurrencyConflictError,
  ReviewResourceNotFoundError,
} from './review-errors';

export class ReviewSessionStateConflictError extends Error {}
export class ReviewSubmissionConflictError extends Error {}
export class NoUsableReviewQuestionError extends Error {}

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_RETRY_COUNT = 1;
const DEFAULT_RETEST_AFTER_ITEMS: ReviewRetestAfterItems = 3;
const DIAGNOSIS_SKILL_WINDOW_DAYS = 14;
const MAX_LEARNER_SNAPSHOT_VOCABULARIES = 100;
const sessionSelect = {
  id: true,
  targetDurationMinutes: true,
  reviewGoal: true,
  plannedItemCount: true,
  planSummary: true,
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
  correctAnswerText: true,
  points: true,
  displayOrder: true,
  options: {
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: safeOptionSelect,
  },
} satisfies Prisma.ReviewQuestionSelect;

const answerWordCharacters = (answer: string | null | undefined): string[][] =>
  answer
    ?.trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => Array.from(word)) ?? [];

const hintPositionHash = (value: string): number => {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

const shuffledHintCharacters = (
  seed: string,
  words: string[][],
): Array<{ character: string; wordIndex: number; characterIndex: number }> =>
  words
    .flatMap((word, wordIndex) =>
      word.map((character, characterIndex) => ({
        character,
        wordIndex,
        characterIndex,
      })),
    )
    .sort(
      (left, right) =>
        hintPositionHash(`${seed}:${left.wordIndex}:${left.characterIndex}`) -
          hintPositionHash(
            `${seed}:${right.wordIndex}:${right.characterIndex}`,
          ) ||
        left.wordIndex - right.wordIndex ||
        left.characterIndex - right.characterIndex,
    );

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
} satisfies Prisma.ReviewQuestionSelect;

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
  lastReviewedAt: true,
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

export type ReviewVocabulary = Prisma.UserVocabularyGetPayload<{
  select: typeof reviewVocabularySelect;
}>;

export interface ReviewAnswerSubmissionQuestion {
  id: string;
  articleSentenceTermId: string | null;
  questionType: QuestionType;
  correctAnswerText: string | null;
  answerExplanation: string | null;
  isCaseSensitive: boolean;
  points: number;
  options: Array<{
    id: string;
    optionText: string;
    isCorrect: boolean;
    explanation: string | null;
  }>;
}

export interface ReviewAnswerSubmissionContext {
  session: {
    id: string;
    status: ReviewSessionStatus;
  };
  item: {
    id: string;
    userVocabularyId: string | null;
    retryCount: number;
    answerCount: number;
    sequenceNumber: number;
    question: ReviewAnswerSubmissionQuestion;
  };
  vocabulary: ReviewVocabulary | null;
  pendingItemsAfterCurrent: Array<{ id: string; sequenceNumber: number }>;
  recentAttempts: LearnerSnapshotAttempt[];
  retryQuestionCandidates: Array<{ id: string; questionType: QuestionType }>;
}

/**
 * Persisted answer-submission facts after application services have graded,
 * scored, scheduled, and selected any retry question. The repository only
 * validates this optimistic snapshot and commits these supplied values.
 */
export interface CommitReviewAnswerInput {
  expected: {
    sessionId: string;
    reviewSessionItemId: string;
    reviewQuestionId: string;
    retryCount: number;
    answerCount: number;
    userVocabularyId: string | null;
  };
  answer: {
    selectedOptionId: string | null;
    userAnswerText: string | null;
    isCorrect: boolean;
    responseTimeMs: number | null;
    hintsUsed: number;
    inferredReviewScore: number;
    skillDimension: ReviewSkillDimension;
    answeredAt: Date;
  };
  item: {
    status: ReviewSessionItemStatus;
    retryCount: number;
    finalInferredScore: number | null;
    completedAt: Date | null;
    retryQuestionId?: string;
    moveAfterPendingItems?: ReviewRetestAfterItems;
  };
  vocabularySchedule?: VocabularyScheduleUpdate;
}

export interface VocabularyScheduleUpdate {
  learningStatus: LearningStatus;
  reviewIntervalDays: number;
  lastReviewedAt: Date;
  nextReviewAt: Date;
  consecutiveCorrectReviews: number;
  lapseCount: number;
  lastReviewScore: number;
}

export interface SkipReviewItemContext {
  vocabulary: ReviewVocabulary | null;
  retryCount: number;
}

export interface ReviewResult {
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

export interface LearnerSnapshotAttempt {
  answerId: string;
  questionType: QuestionType;
  skillDimension: ReviewSkillDimension;
  errorType: ReviewErrorType | null;
  isCorrect: boolean;
  responseTimeMs: number | null;
  hintsUsed: number;
  inferredReviewScore: number | null;
  answeredAt: Date;
}

export interface LearnerSnapshotVocabulary {
  id: string;
  articleSentenceTermId: string;
  savedWordDisplay: string;
  savedLemma: string;
  savedPartOfSpeech: string;
  savedMeaningVi: string;
  savedContextSentence: string;
  savedExplanation: string | null;
  savedCefrLevel: CefrLevel;
  learningStatus: LearningStatus;
  savedAt: Date;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  overdueDurationMs: number;
  reviewIntervalDays: number | null;
  consecutiveCorrectReviews: number;
  lapseCount: number;
  lastReviewScore: number | null;
  recentAttempts: LearnerSnapshotAttempt[];
}

export interface LearnerSkillAggregate {
  skillDimension: ReviewSkillDimension;
  attemptCount: number;
  correctCount: number;
  accuracy: number;
  averageResponseTimeMs: number | null;
}

export interface LearnerReviewSnapshot {
  currentCefrLevel: CefrLevel | null;
  skillWindowDays: 7 | 14;
  skillAggregates: LearnerSkillAggregate[];
  eligibleVocabulary: LearnerSnapshotVocabulary[];
}

export interface SessionPlanningSnapshotCandidate {
  reviewSessionItemId: string;
  alias: string;
  vocabulary: LearnerSnapshotVocabulary;
}

export interface SessionPlanningSnapshot {
  currentCefrLevel: CefrLevel | null;
  skillWindowDays: 7 | 14;
  skillAggregates: LearnerSkillAggregate[];
  candidates: SessionPlanningSnapshotCandidate[];
}

export interface PostAnswerDiagnosisSnapshot {
  request: {
    reviewSessionItemId: string;
    reviewAnswerId: string;
    isCorrect: false;
    wasSkipped: false;
    lapseCount: number;
    input: DiagnoseReviewAnswerInput;
  };
  vocabulary: VocabularyQuestionSnapshot;
  originalQuestionType: QuestionType;
  fallbackRetestQuestionType: QuestionType;
  fallbackRetestAfterItems: ReviewRetestAfterItems;
  attemptNumber: number;
}

interface RecentAttemptSnapshotRow {
  answerId: string;
  userVocabularyId: string;
  questionType: QuestionType;
  skillDimension: ReviewSkillDimension | null;
  errorType: ReviewErrorType | null;
  isCorrect: boolean;
  responseTimeMs: number | null;
  hintsUsed: number;
  inferredReviewScore: number | null;
  answeredAt: Date;
}

interface RawReviewTimingStats {
  attemptCount: number;
  averageResponseTimeMs: number | null;
}

@Injectable()
/**
 * Persistence boundary for review-session state, session items, history, and
 * the serializable transactions that protect those records.
 *
 * Domain rules are deliberately supplied by the application layer. This keeps
 * this class free of Nest-injected domain services while retaining the current
 * transaction scopes during the incremental repository split.
 */
export class ReviewSessionsRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly appConfig: ReturnTypeOfAppConfig,
  ) {}

  async getRecentReviewTimingStats(
    userId: string,
    now: Date,
    skillDimension?: ReviewSkillDimension,
    windowDays = 14,
  ): Promise<RawReviewTimingStats> {
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 90) {
      throw new RangeError('windowDays must be between 1 and 90');
    }
    const windowStart = new Date(
      now.getTime() - windowDays * 24 * 60 * 60 * 1_000,
    );
    const rows = await this.prisma.$queryRaw<RawReviewTimingStats[]>(Prisma.sql`
      SELECT
        COUNT(answer.response_time_ms)::int AS "attemptCount",
        AVG(answer.response_time_ms)::float8 AS "averageResponseTimeMs"
      FROM review_answers answer
      JOIN review_session_items item
        ON item.id = answer.review_session_item_id
      JOIN review_sessions session
        ON session.id = item.review_session_id
      WHERE session.user_id = ${userId}::uuid
        AND answer.response_time_ms IS NOT NULL
        ${
          skillDimension
            ? Prisma.sql`AND answer.skill_dimension = ${skillDimension}::review_skill_dimension`
            : Prisma.empty
        }
        AND answer.answered_at >= ${windowStart}
        AND answer.answered_at <= ${now}
    `);
    return rows[0] ?? { attemptCount: 0, averageResponseTimeMs: null };
  }

  async getLearnerSnapshot(
    userId: string,
    limit: number,
    now: Date,
    skillWindowDays: 7 | 14 = 14,
  ): Promise<LearnerReviewSnapshot> {
    if (!Number.isFinite(limit)) {
      throw new RangeError('limit must be finite');
    }
    const boundedLimit = Math.min(
      Math.max(Math.trunc(limit), 1),
      MAX_LEARNER_SNAPSHOT_VOCABULARIES,
    );
    return this.prisma.$transaction(async (tx) => {
      const vocabularies = await this.findEligibleVocabularies(
        tx,
        userId,
        { limit: boundedLimit },
        now,
      );
      const [profile, attemptsByVocabulary, skillAggregates] =
        await Promise.all([
          tx.userProfile.findUnique({
            where: { userId },
            select: { currentCefrLevel: true },
          }),
          this.loadRecentAttemptSnapshots(tx, vocabularies),
          this.loadSkillAggregates(tx, userId, now, skillWindowDays),
        ]);

      return {
        currentCefrLevel: profile?.currentCefrLevel ?? null,
        skillWindowDays,
        skillAggregates,
        eligibleVocabulary: vocabularies.map((vocabulary) =>
          this.toLearnerSnapshotVocabulary(
            vocabulary,
            attemptsByVocabulary.get(vocabulary.id) ?? [],
            now,
          ),
        ),
      };
    });
  }

  async getSessionPlanningSnapshot(
    userId: string,
    sessionId: string,
    now: Date,
    skillWindowDays: 7 | 14 = 14,
  ): Promise<SessionPlanningSnapshot | null> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.reviewSession.findFirst({
        where: {
          id: sessionId,
          userId,
          status: ReviewSessionStatus.IN_PROGRESS,
          planSummary: null,
        },
        select: { id: true },
      });
      if (!session) return null;

      const items = await tx.reviewSessionItem.findMany({
        where: {
          reviewSessionId: session.id,
          status: ReviewSessionItemStatus.PENDING,
          userVocabularyId: { not: null },
        },
        orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
        take: MAX_LEARNER_SNAPSHOT_VOCABULARIES,
        select: {
          id: true,
          userVocabulary: { select: reviewVocabularySelect },
        },
      });
      const boundedItems = items.flatMap((item) =>
        item.userVocabulary
          ? [{ id: item.id, vocabulary: item.userVocabulary }]
          : [],
      );
      if (boundedItems.length === 0) return null;
      const vocabularies = boundedItems.map(({ vocabulary }) => vocabulary);
      const [profile, attemptsByVocabulary, skillAggregates] =
        await Promise.all([
          tx.userProfile.findUnique({
            where: { userId },
            select: { currentCefrLevel: true },
          }),
          this.loadRecentAttemptSnapshots(tx, vocabularies),
          this.loadSkillAggregates(tx, userId, now, skillWindowDays),
        ]);

      return {
        currentCefrLevel: profile?.currentCefrLevel ?? null,
        skillWindowDays,
        skillAggregates,
        candidates: boundedItems.map(({ id, vocabulary }, index) => ({
          reviewSessionItemId: id,
          alias: `v${index + 1}`,
          vocabulary: this.toLearnerSnapshotVocabulary(
            vocabulary,
            attemptsByVocabulary.get(vocabulary.id) ?? [],
            now,
          ),
        })),
      };
    });
  }

  startSession(
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
    preparedAiQuestions: PreparedAiReviewQuestion[] = [],
    initialAiCallCount = 0,
  ) {
    this.assertInitialAiCallCount(initialAiCallCount);
    return this.withSerializableRetry(async (tx) => {
      const active = await tx.reviewSession.findFirst({
        where: {
          userId,
          status: ReviewSessionStatus.IN_PROGRESS,
        },
        select: sessionSelect,
      });
      if (active) {
        return this.getSessionStateWithClient(tx, active);
      }
      const vocabularies = await this.findEligibleVocabularies(
        tx,
        userId,
        dto,
        now,
      );
      if (vocabularies.length === 0) return null;

      const assignedQuestions = await this.assignInitialQuestions(
        tx,
        vocabularies,
        preparedAiQuestions,
      );
      if (assignedQuestions.length !== vocabularies.length) {
        throw new NoUsableReviewQuestionError();
      }

      const session = await tx.reviewSession.create({
        data: {
          userId,
          status: ReviewSessionStatus.IN_PROGRESS,
          completedAt: null,
          targetDurationMinutes: dto.targetDurationMinutes,
          reviewGoal: dto.reviewGoal,
          aiCallCount: initialAiCallCount,
        },
        select: sessionSelect,
      });
      await tx.reviewSessionItem.createMany({
        data: assignedQuestions.map(({ vocabulary, question }, index) => ({
          reviewSessionId: session.id,
          userVocabularyId: vocabulary.id,
          reviewQuestionId: question.id,
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

  async revealFillBlankHint(
    userId: string,
    sessionId: string,
    reviewSessionItemId: string,
    hintIndex: number,
  ) {
    const activeItem = await this.prisma.reviewSessionItem.findFirst({
      where: {
        reviewSessionId: sessionId,
        status: ReviewSessionItemStatus.PENDING,
        reviewSession: {
          is: {
            userId,
            status: ReviewSessionStatus.IN_PROGRESS,
          },
        },
      },
      orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        reviewQuestion: {
          select: {
            id: true,
            questionType: true,
            correctAnswerText: true,
          },
        },
      },
    });
    if (!activeItem || activeItem.id !== reviewSessionItemId) {
      throw new ReviewSubmissionConflictError();
    }

    const {
      id: questionId,
      questionType,
      correctAnswerText,
    } = activeItem.reviewQuestion;
    const words = answerWordCharacters(correctAnswerText);
    if (questionType !== QuestionType.FILL_BLANK || words.length === 0) {
      throw new InvalidAnswerShapeError(
        'Progressive hints are only available for fill-blank questions',
      );
    }
    const characters = shuffledHintCharacters(
      `${sessionId}:${questionId}`,
      words,
    );
    if (hintIndex >= characters.length) {
      throw new InvalidAnswerShapeError(
        'No more hint characters are available',
      );
    }

    const hint = characters[hintIndex];
    return {
      revealedCharacter: hint.character,
      wordIndex: hint.wordIndex,
      characterIndex: hint.characterIndex,
      totalCharacters: characters.length,
    };
  }

  /**
   * Loads the persisted facts needed to decide an answer submission. This is
   * deliberately a read snapshot: grading, score inference, scheduling, and
   * retry selection remain application decisions and must be supplied to
   * commitAnswerSubmission after they have been computed.
   */
  getAnswerSubmissionContext(
    userId: string,
    sessionId: string,
    dto: Pick<
      SubmitReviewAnswerDto,
      'reviewSessionItemId' | 'reviewQuestionId'
    >,
  ): Promise<ReviewAnswerSubmissionContext> {
    return this.prisma.$transaction(async (tx) => {
      const { session, item } = await this.loadActiveAnswerSubmissionState(
        tx,
        userId,
        sessionId,
      );
      this.assertAnswerSubmissionExpectation(item, dto);

      const vocabulary = item.userVocabularyId
        ? await tx.userVocabulary.findUnique({
            where: { id: item.userVocabularyId },
            select: reviewVocabularySelect,
          })
        : null;
      const pendingItemsAfterCurrent = await tx.reviewSessionItem.findMany({
        where: {
          reviewSessionId: session.id,
          status: ReviewSessionItemStatus.PENDING,
          id: { not: item.id },
          sequenceNumber: { gt: item.sequenceNumber },
        },
        orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
        take: 5,
        select: { id: true, sequenceNumber: true },
      });
      const [recentAttempts, retryQuestionCandidates] = vocabulary
        ? await Promise.all([
            this.loadRecentAttemptSnapshots(tx, [vocabulary]).then(
              (attempts) => attempts.get(vocabulary.id) ?? [],
            ),
            this.loadRetryQuestionCandidates(tx, vocabulary),
          ])
        : [[], []];

      return {
        session: {
          id: session.id,
          status: session.status,
        },
        item: {
          id: item.id,
          userVocabularyId: item.userVocabularyId,
          retryCount: item.retryCount,
          answerCount: item._count.answers,
          sequenceNumber: item.sequenceNumber,
          question: item.reviewQuestion,
        },
        vocabulary,
        pendingItemsAfterCurrent,
        recentAttempts,
        retryQuestionCandidates,
      };
    });
  }

  getAnswerDiagnosisSkillAggregates(userId: string, now: Date) {
    return this.prisma.$transaction((tx) =>
      this.loadSkillAggregates(tx, userId, now, DIAGNOSIS_SKILL_WINDOW_DAYS),
    );
  }

  /**
   * Atomically persists an answer decision that was computed from an earlier
   * ReviewAnswerSubmissionContext. Revalidation makes stale or duplicate
   * submissions fail before they can create a second attempt.
   */
  commitAnswerSubmission(userId: string, input: CommitReviewAnswerInput) {
    return this.withSerializableRetry(async (tx) => {
      const { session, item } = await this.loadActiveAnswerSubmissionState(
        tx,
        userId,
        input.expected.sessionId,
      );
      this.assertAnswerSubmissionExpectation(item, input.expected);
      if (
        item.retryCount !== input.expected.retryCount ||
        item._count.answers !== input.expected.answerCount ||
        item.userVocabularyId !== input.expected.userVocabularyId
      ) {
        throw new ReviewSubmissionConflictError();
      }
      if (
        (input.item.retryQuestionId !== undefined ||
          input.item.moveAfterPendingItems !== undefined) &&
        input.item.status !== ReviewSessionItemStatus.PENDING
      ) {
        throw new ReviewSubmissionConflictError();
      }
      if (
        input.vocabularySchedule !== undefined &&
        item.userVocabularyId === null
      ) {
        throw new ReviewSubmissionConflictError();
      }

      let answer: { id: string };
      try {
        answer = await tx.reviewAnswer.create({
          data: {
            reviewSessionItemId: item.id,
            reviewQuestionId: item.reviewQuestion.id,
            selectedOptionId: input.answer.selectedOptionId,
            userAnswerText: input.answer.userAnswerText,
            isCorrect: input.answer.isCorrect,
            responseTimeMs: input.answer.responseTimeMs,
            attemptNumber: item._count.answers + 1,
            hintsUsed: input.answer.hintsUsed,
            inferredReviewScore: input.answer.inferredReviewScore,
            skillDimension: input.answer.skillDimension,
            answeredAt: input.answer.answeredAt,
          },
          select: { id: true },
        });
      } catch (error: unknown) {
        if (this.hasPrismaCode(error, 'P2002')) {
          throw new ReviewSubmissionConflictError();
        }
        throw error;
      }

      await tx.reviewSessionItem.update({
        where: { id: item.id },
        data: {
          status: input.item.status,
          retryCount: input.item.retryCount,
          finalInferredScore: input.item.finalInferredScore,
          completedAt: input.item.completedAt,
          ...(input.item.retryQuestionId
            ? { reviewQuestionId: input.item.retryQuestionId }
            : {}),
        },
        select: { id: true },
      });
      if (input.item.moveAfterPendingItems !== undefined) {
        await this.movePendingItemAfter(
          tx,
          session.id,
          item.id,
          input.item.moveAfterPendingItems,
        );
      }
      if (item.userVocabularyId && input.vocabularySchedule) {
        await tx.userVocabulary.update({
          where: { id: item.userVocabularyId },
          data: input.vocabularySchedule,
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
              completedAt: input.answer.answeredAt,
            },
            select: sessionSelect,
          })
        : session;
      const state = await this.getSessionStateWithClient(tx, currentSession);
      const completionSummary = sessionCompleted
        ? await this.getCompletionSummaryWithClient(
            tx,
            session.id,
            currentSession.completedAt ?? input.answer.answeredAt,
          )
        : undefined;

      return {
        answerId: answer.id,
        sessionCompleted,
        ...(completionSummary ? { completionSummary } : {}),
        ...state,
      };
    });
  }

  async getSkipItemContext(
    userId: string,
    sessionId: string,
    dto: SkipReviewSessionItemDto,
  ): Promise<SkipReviewItemContext> {
    const session = await this.prisma.reviewSession.findFirst({
      where: { id: sessionId, userId, status: ReviewSessionStatus.IN_PROGRESS },
      select: { id: true },
    });
    if (!session) throw new ReviewSubmissionConflictError();
    const item = await this.prisma.reviewSessionItem.findFirst({
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
        reviewQuestion: { select: { id: true } },
      },
    });
    if (
      !item ||
      item.id !== dto.reviewSessionItemId ||
      item.reviewQuestion.id !== dto.reviewQuestionId ||
      item._count.answers !== item.retryCount ||
      item.retryCount > MAX_RETRY_COUNT
    ) {
      throw new ReviewSubmissionConflictError();
    }
    const vocabulary = item.userVocabularyId
      ? await this.prisma.userVocabulary.findUnique({
          where: { id: item.userVocabularyId },
          select: reviewVocabularySelect,
        })
      : null;
    return { vocabulary, retryCount: item.retryCount };
  }

  skipItem(
    userId: string,
    sessionId: string,
    dto: SkipReviewSessionItemDto,
    vocabularySchedule?: VocabularyScheduleUpdate,
  ) {
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
          reviewQuestion: { select: { id: true } },
        },
      });
      if (
        !item ||
        item.id !== dto.reviewSessionItemId ||
        item.reviewQuestion.id !== dto.reviewQuestionId ||
        item._count.answers !== item.retryCount ||
        item.retryCount > MAX_RETRY_COUNT
      ) {
        throw new ReviewSubmissionConflictError();
      }

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
      if (item.userVocabularyId && vocabularySchedule) {
        await tx.userVocabulary.update({
          where: { id: item.userVocabularyId },
          data: vocabularySchedule,
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
          items: {
            orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
            select: {
              reviewQuestion: { select: { points: true } },
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
        const questions = row.items.map(({ reviewQuestion, answers }) => ({
          points: reviewQuestion.points,
          reviewAnswers: answers,
        }));
        return {
          session: {
            id: row.id,
            targetDurationMinutes: row.targetDurationMinutes,
            reviewGoal: row.reviewGoal,
            plannedItemCount: row.plannedItemCount,
            planSummary: row.planSummary,
            status: row.status,
            startedAt: row.startedAt,
            completedAt: row.completedAt,
          },
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
            userVocabulary: {
              select: {
                id: true,
                savedWordDisplay: true,
                savedMeaningVi: true,
                savedExplanation: true,
              },
            },
            reviewQuestion: {
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
              select: {
                selectedOptionId: true,
                userAnswerText: true,
                isCorrect: true,
                skillDimension: true,
                errorType: true,
                answeredAt: true,
                reviewQuestion: {
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
    const resultQuestions = session.items.map(
      ({ reviewQuestion, answers }) => ({
        points: answers[0]?.reviewQuestion.points ?? reviewQuestion.points,
        reviewAnswers: answers
          .slice(0, 1)
          .map(({ isCorrect }) => ({ isCorrect })),
      }),
    );
    const answers = session.items.flatMap(({ answers }) => {
      const answer = answers[0];
      if (!answer) return [];
      const question = answer.reviewQuestion;
      const selectedOption =
        question.options.find(({ id }) => id === answer.selectedOptionId) ??
        null;
      return [
        {
          reviewQuestionId: question.id,
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
          correctAnswer: correctAnswerFor(question),
          explanation:
            question.answerExplanation ?? selectedOption?.explanation ?? null,
          isCorrect: answer.isCorrect === true,
          points: question.points,
          earnedPoints: answer.isCorrect ? question.points : 0,
          answeredAt: answer.answeredAt,
        },
      ];
    });
    const skillBreakdown = this.buildSessionSkillBreakdown(
      session.items.flatMap(({ answers: itemAnswers }) => itemAnswers),
    );
    const wordsToRevisit = session.items.flatMap(
      ({ userVocabulary, answers: itemAnswers }) => {
        const incorrectAnswer = itemAnswers.find(
          ({ isCorrect }) => isCorrect === false,
        );
        if (!incorrectAnswer) return [];
        const selectedOption =
          incorrectAnswer.reviewQuestion.options.find(
            ({ id }) => id === incorrectAnswer.selectedOptionId,
          ) ?? null;
        return [
          {
            userVocabularyId: userVocabulary?.id ?? null,
            wordOrPhrase:
              userVocabulary?.savedWordDisplay ??
              correctAnswerFor(incorrectAnswer.reviewQuestion),
            meaningVi: userVocabulary?.savedMeaningVi ?? null,
            skillDimension: incorrectAnswer.skillDimension,
            errorType: incorrectAnswer.errorType,
            explanation:
              incorrectAnswer.reviewQuestion.answerExplanation ??
              selectedOption?.explanation ??
              userVocabulary?.savedExplanation ??
              null,
            recoveredInSession: itemAnswers[0]?.isCorrect === true,
          },
        ];
      },
    );
    return {
      result: this.calculateResult(resultQuestions, session.completedAt),
      answers,
      skillBreakdown,
      wordsToRevisit,
    };
  }

  private buildSessionSkillBreakdown(
    answers: Array<{
      skillDimension: ReviewSkillDimension | null;
      isCorrect: boolean | null;
    }>,
  ) {
    const aggregates = new Map<
      ReviewSkillDimension,
      { attempts: number; correct: number }
    >();
    for (const answer of answers) {
      if (answer.skillDimension === null || answer.isCorrect === null) continue;
      const aggregate = aggregates.get(answer.skillDimension) ?? {
        attempts: 0,
        correct: 0,
      };
      aggregate.attempts += 1;
      if (answer.isCorrect) aggregate.correct += 1;
      aggregates.set(answer.skillDimension, aggregate);
    }
    return [...aggregates.entries()]
      .map(([skillDimension, aggregate]) => ({
        skillDimension,
        ...aggregate,
        accuracy:
          Math.round((aggregate.correct / aggregate.attempts) * 10_000) /
          10_000,
      }))
      .sort(
        (left, right) =>
          right.attempts - left.attempts ||
          left.skillDimension.localeCompare(right.skillDimension),
      );
  }

  async getDueRecommendations(userId: string, now: Date) {
    const duePredicate = reviewEligibilitySql(
      userId,
      now,
      this.appConfig.analyticsTimezone,
    );
    const countRows = await this.prisma.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`
        SELECT COUNT(DISTINCT uv.id)::int AS count
        FROM user_vocabularies uv
        WHERE ${duePredicate}
      `,
    );

    return {
      dueVocabularyCount: countRows[0]?.count ?? 0,
    };
  }

  private async findEligibleVocabularies(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
  ): Promise<ReviewVocabulary[]> {
    const commonWhere = reviewEligibilityWhere(
      userId,
      now,
      this.appConfig.analyticsTimezone,
    );
    const dueBefore = reviewDayEnd(now, this.appConfig.analyticsTimezone);
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

    await take({ nextReviewAt: { lt: dueBefore } }, [
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
    vocabularies: ReviewVocabulary[],
    preparedAiQuestions: PreparedAiReviewQuestion[],
  ) {
    if (preparedAiQuestions.length === 0) return [];
    const preparedByVocabularyId = new Map(
      preparedAiQuestions.map((question) => [
        question.userVocabularyId,
        question,
      ]),
    );
    const questions = await tx.reviewQuestion.findMany({
      where: {
        id: {
          in: preparedAiQuestions.map(
            ({ reviewQuestionId }) => reviewQuestionId,
          ),
        },
        generationSource: ReviewQuestionGenerationSource.AI,
        generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
        isActive: true,
      },
      select: {
        id: true,
        articleSentenceTermId: true,
        difficultyCefr: true,
        questionType: true,
      },
    });

    return vocabularies.flatMap((vocabulary) => {
      const prepared = preparedByVocabularyId.get(vocabulary.id);
      if (!prepared) return [];
      const question = questions.find(
        (candidate) =>
          candidate.id === prepared.reviewQuestionId &&
          candidate.articleSentenceTermId ===
            vocabulary.articleSentenceTermId &&
          candidate.articleSentenceTermId === prepared.articleSentenceTermId &&
          candidate.difficultyCefr === vocabulary.savedCefrLevel &&
          candidate.difficultyCefr === prepared.difficultyCefr &&
          candidate.questionType === prepared.questionType,
      );
      return question ? [{ vocabulary, question }] : [];
    });
  }

  private async movePendingItemAfter(
    tx: Prisma.TransactionClient,
    sessionId: string,
    itemId: string,
    afterItems: ReviewRetestAfterItems,
  ): Promise<void> {
    const pending = await tx.reviewSessionItem.findMany({
      where: {
        reviewSessionId: sessionId,
        status: ReviewSessionItemStatus.PENDING,
      },
      orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
      select: { id: true, sequenceNumber: true },
    });
    const currentIndex = pending.findIndex(({ id }) => id === itemId);
    const otherItems = pending.filter(({ id }) => id !== itemId);
    if (currentIndex < 0 || otherItems.length < afterItems) {
      throw new ReviewSessionStateConflictError();
    }
    const reordered = [...otherItems];
    const current = pending[currentIndex];
    reordered.splice(afterItems, 0, current);
    if (reordered.every((item, index) => item.id === pending[index]?.id)) {
      return;
    }

    const sequenceNumbers = pending.map(({ sequenceNumber }) => sequenceNumber);
    await tx.reviewSessionItem.update({
      where: { id: itemId },
      data: { sequenceNumber: 0 },
      select: { id: true },
    });
    if (currentIndex > afterItems) {
      for (let index = currentIndex - 1; index >= afterItems; index -= 1) {
        await tx.reviewSessionItem.update({
          where: { id: pending[index].id },
          data: { sequenceNumber: sequenceNumbers[index + 1] },
          select: { id: true },
        });
      }
    } else {
      for (let index = currentIndex + 1; index <= afterItems; index += 1) {
        await tx.reviewSessionItem.update({
          where: { id: pending[index].id },
          data: { sequenceNumber: sequenceNumbers[index - 1] },
          select: { id: true },
        });
      }
    }
    await tx.reviewSessionItem.update({
      where: { id: itemId },
      data: { sequenceNumber: sequenceNumbers[afterItems] },
      select: { id: true },
    });
  }

  private readRetestDecision(payload: unknown): {
    questionType: QuestionType;
    afterItems: ReviewRetestAfterItems;
  } | null {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return null;
    }
    const retest = 'retest' in payload ? payload.retest : null;
    if (
      typeof retest !== 'object' ||
      retest === null ||
      Array.isArray(retest)
    ) {
      return null;
    }
    const questionType =
      'questionType' in retest ? retest.questionType : undefined;
    const afterItems = 'afterItems' in retest ? retest.afterItems : undefined;
    if (
      !this.isQuestionType(questionType) ||
      !this.isRetestOffset(afterItems)
    ) {
      return null;
    }
    return {
      questionType,
      afterItems,
    };
  }

  private readAgentAction(payload: unknown): ReviewAgentAction | null {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      !('action' in payload)
    ) {
      return null;
    }
    return (
      Object.values(ReviewAgentAction).find(
        (candidate) => candidate === payload.action,
      ) ?? null
    );
  }

  private isQuestionType(value: unknown): value is QuestionType {
    return (
      typeof value === 'string' &&
      Object.values(QuestionType).some((candidate) => candidate === value)
    );
  }

  private isRetestOffset(value: unknown): value is ReviewRetestAfterItems {
    return value === 2 || value === 3 || value === 4 || value === 5;
  }

  private defaultRetestOffset(availableItems: number): ReviewRetestAfterItems {
    return availableItems >= DEFAULT_RETEST_AFTER_ITEMS ? 3 : 2;
  }

  private toAgentFeedback(decision: {
    source: ReviewDecisionSource;
    action: ReviewAgentAction | null;
    skillDimension: ReviewSkillDimension | null;
    errorType: ReviewErrorType | null;
    decisionPayload: unknown;
  }) {
    const retest = this.readRetestDecision(decision.decisionPayload);
    const payload =
      typeof decision.decisionPayload === 'object' &&
      decision.decisionPayload !== null &&
      !Array.isArray(decision.decisionPayload)
        ? decision.decisionPayload
        : null;
    const lesson =
      payload && 'microLesson' in payload ? payload.microLesson : null;
    const microLesson =
      typeof lesson === 'object' && lesson !== null && !Array.isArray(lesson)
        ? {
            title: String('title' in lesson ? lesson.title : ''),
            explanation: String(
              'explanation' in lesson ? lesson.explanation : '',
            ),
            example: String('example' in lesson ? lesson.example : ''),
          }
        : null;
    return {
      source: decision.source,
      action: decision.action,
      skillDimension: decision.skillDimension,
      errorType: decision.errorType,
      ...(microLesson ? { microLesson } : {}),
      ...(retest ? { retestAfterItems: retest.afterItems } : {}),
    };
  }

  private async loadActiveAnswerSubmissionState(
    tx: Prisma.TransactionClient,
    userId: string,
    sessionId: string,
  ) {
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
        reviewQuestion: { select: gradingQuestionSelect },
      },
    });
    if (!item) throw new ReviewSubmissionConflictError();
    return { session, item };
  }

  private assertAnswerSubmissionExpectation(
    item: {
      id: string;
      retryCount: number;
      _count: { answers: number };
      reviewQuestion: { id: string };
    },
    expected: {
      reviewSessionItemId: string;
      reviewQuestionId: string;
    },
  ): void {
    if (
      item.id !== expected.reviewSessionItemId ||
      item.reviewQuestion.id !== expected.reviewQuestionId ||
      item._count.answers !== item.retryCount ||
      item.retryCount > MAX_RETRY_COUNT
    ) {
      throw new ReviewSubmissionConflictError();
    }
  }

  private async loadRetryQuestionCandidates(
    tx: Prisma.TransactionClient,
    vocabulary: ReviewVocabulary,
  ): Promise<ReviewAnswerSubmissionContext['retryQuestionCandidates']> {
    return tx.reviewQuestion.findMany({
      where: {
        articleSentenceTermId: vocabulary.articleSentenceTermId,
        difficultyCefr: vocabulary.savedCefrLevel,
        generationSource: ReviewQuestionGenerationSource.AI,
        generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
        isActive: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: { id: true, questionType: true },
    });
  }

  private toLearnerSnapshotVocabulary(
    vocabulary: ReviewVocabulary,
    recentAttempts: LearnerSnapshotAttempt[],
    now: Date,
  ): LearnerSnapshotVocabulary {
    return {
      id: vocabulary.id,
      articleSentenceTermId: vocabulary.articleSentenceTermId,
      savedWordDisplay: vocabulary.savedWordDisplay,
      savedLemma: vocabulary.savedLemma,
      savedPartOfSpeech: vocabulary.savedPartOfSpeech,
      savedMeaningVi: vocabulary.savedMeaningVi,
      savedContextSentence: vocabulary.savedContextSentence,
      savedExplanation: vocabulary.savedExplanation,
      savedCefrLevel: vocabulary.savedCefrLevel,
      learningStatus: vocabulary.learningStatus,
      savedAt: vocabulary.savedAt,
      lastReviewedAt: vocabulary.lastReviewedAt,
      nextReviewAt: vocabulary.nextReviewAt,
      overdueDurationMs: vocabulary.nextReviewAt
        ? Math.max(0, now.getTime() - vocabulary.nextReviewAt.getTime())
        : 0,
      reviewIntervalDays: vocabulary.reviewIntervalDays,
      consecutiveCorrectReviews: vocabulary.consecutiveCorrectReviews,
      lapseCount: vocabulary.lapseCount,
      lastReviewScore: vocabulary.lastReviewScore,
      recentAttempts,
    };
  }

  private async loadSkillAggregates(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
    skillWindowDays: 7 | 14,
  ): Promise<LearnerSkillAggregate[]> {
    const skillWindowStart = new Date(
      now.getTime() - skillWindowDays * 24 * 60 * 60 * 1_000,
    );
    const [skillTotals, skillCorrectCounts] = await Promise.all([
      tx.reviewAnswer.groupBy({
        by: ['skillDimension'],
        where: {
          skillDimension: { not: null },
          answeredAt: { gte: skillWindowStart, lte: now },
          reviewSessionItem: {
            is: { reviewSession: { is: { userId } } },
          },
        },
        _count: { _all: true },
        _avg: { responseTimeMs: true },
      }),
      tx.reviewAnswer.groupBy({
        by: ['skillDimension'],
        where: {
          skillDimension: { not: null },
          isCorrect: true,
          answeredAt: { gte: skillWindowStart, lte: now },
          reviewSessionItem: {
            is: { reviewSession: { is: { userId } } },
          },
        },
        _count: { _all: true },
      }),
    ]);
    const correctCountBySkill = new Map<ReviewSkillDimension, number>();
    for (const aggregate of skillCorrectCounts) {
      if (aggregate.skillDimension) {
        correctCountBySkill.set(
          aggregate.skillDimension,
          aggregate._count._all,
        );
      }
    }
    const skillAggregates: LearnerSkillAggregate[] = [];
    for (const aggregate of skillTotals) {
      if (!aggregate.skillDimension) continue;
      const correctCount =
        correctCountBySkill.get(aggregate.skillDimension) ?? 0;
      skillAggregates.push({
        skillDimension: aggregate.skillDimension,
        attemptCount: aggregate._count._all,
        correctCount,
        accuracy: correctCount / aggregate._count._all,
        averageResponseTimeMs: aggregate._avg.responseTimeMs,
      });
    }
    skillAggregates.sort((left, right) =>
      left.skillDimension.localeCompare(right.skillDimension),
    );
    return skillAggregates;
  }

  private async loadRecentAttemptSnapshots(
    tx: Prisma.TransactionClient,
    vocabularies: ReviewVocabulary[],
  ): Promise<Map<string, LearnerSnapshotAttempt[]>> {
    if (vocabularies.length === 0) return new Map();
    const vocabularyIds = Prisma.join(
      vocabularies.map(({ id }) => Prisma.sql`${id}::uuid`),
    );
    const rows = await tx.$queryRaw<RecentAttemptSnapshotRow[]>(Prisma.sql`
      SELECT
        recent.answer_id AS "answerId",
        recent.user_vocabulary_id AS "userVocabularyId",
        recent.question_type AS "questionType",
        recent.skill_dimension AS "skillDimension",
        recent.error_type AS "errorType",
        recent.is_correct AS "isCorrect",
        recent.response_time_ms AS "responseTimeMs",
        recent.hints_used AS "hintsUsed",
        recent.inferred_review_score AS "inferredReviewScore",
        recent.answered_at AS "answeredAt"
      FROM (
        SELECT
          answer.id AS answer_id,
          item.user_vocabulary_id,
          question.question_type,
          answer.skill_dimension,
          answer.error_type,
          answer.is_correct,
          answer.response_time_ms,
          answer.hints_used,
          answer.inferred_review_score,
          answer.answered_at,
          answer.id,
          ROW_NUMBER() OVER (
            PARTITION BY item.user_vocabulary_id
            ORDER BY answer.answered_at DESC, answer.id ASC
          ) AS recent_number
        FROM review_answers answer
        JOIN review_session_items item
          ON item.id = answer.review_session_item_id
        JOIN review_questions question ON question.id = answer.review_question_id
        WHERE item.user_vocabulary_id IN (${vocabularyIds})
          AND answer.is_correct IS NOT NULL
      ) recent
      WHERE recent.recent_number <= ${RECENT_ACCURACY_WINDOW}
      ORDER BY recent.user_vocabulary_id ASC, recent.recent_number ASC
    `);
    const history = new Map<string, LearnerSnapshotAttempt[]>();
    for (const row of rows) {
      const attempts = history.get(row.userVocabularyId) ?? [];
      attempts.push({
        answerId: row.answerId,
        questionType: row.questionType,
        skillDimension:
          row.skillDimension ?? skillDimensionForQuestion(row.questionType),
        errorType: row.errorType,
        isCorrect: row.isCorrect,
        responseTimeMs: row.responseTimeMs,
        hintsUsed: row.hintsUsed,
        inferredReviewScore: row.inferredReviewScore,
        answeredAt: row.answeredAt,
      });
      history.set(row.userVocabularyId, attempts);
    }
    return history;
  }

  private async getSessionStateWithClient(
    client: Prisma.TransactionClient,
    session: {
      id: string;
      targetDurationMinutes: number | null;
      reviewGoal: ReviewGoal | null;
      plannedItemCount: number | null;
      planSummary: string | null;
      status: ReviewSessionStatus;
      startedAt: Date;
      completedAt: Date | null;
    },
  ) {
    const [totalQuestions, answeredCount, next, feedbackDecision] =
      await Promise.all([
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
                reviewQuestion: { select: safeQuestionSelect },
              },
            })
          : Promise.resolve(null),
        session.status === ReviewSessionStatus.IN_PROGRESS
          ? client.reviewAgentDecision.findFirst({
              where: {
                reviewSessionId: session.id,
                kind: ReviewDecisionKind.ANSWER_INTERVENTION,
                reviewSessionItem: {
                  is: { status: ReviewSessionItemStatus.PENDING },
                },
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
              select: {
                source: true,
                action: true,
                skillDimension: true,
                errorType: true,
                decisionPayload: true,
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
            question: this.mapSafeQuestion(next.reviewQuestion),
          }
        : undefined,
      ...(feedbackDecision
        ? { agentFeedback: this.toAgentFeedback(feedbackDecision) }
        : {}),
    };
  }

  private async getCompletionSummaryWithClient(
    client: Prisma.TransactionClient,
    sessionId: string,
    completedAt: Date,
  ): Promise<ReviewResult> {
    const items = await client.reviewSessionItem.findMany({
      where: { reviewSessionId: sessionId },
      orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
      select: {
        reviewQuestion: { select: { points: true } },
        answers: {
          orderBy: [
            { attemptNumber: 'desc' },
            { answeredAt: 'desc' },
            { id: 'asc' },
          ],
          take: 1,
          select: {
            isCorrect: true,
            reviewQuestion: { select: { points: true } },
          },
        },
      },
    });
    return this.calculateResult(
      items.map(({ reviewQuestion, answers }) => ({
        points: answers[0]?.reviewQuestion.points ?? reviewQuestion.points,
        reviewAnswers: answers.map(({ isCorrect }) => ({ isCorrect })),
      })),
      completedAt,
    );
  }

  private calculateResult(
    questions: ResultQuestion[],
    completedAt: Date,
  ): ReviewResult {
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
    questionType: QuestionType;
    prompt: string;
    blankSentence: string | null;
    correctAnswerText: string | null;
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
      answerWordLengths:
        question.questionType === QuestionType.FILL_BLANK
          ? answerWordCharacters(question.correctAnswerText).map(
              (word) => word.length,
            )
          : null,
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

  private assertInitialAiCallCount(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 32_767) {
      throw new RangeError(
        'initialAiCallCount must be a non-negative SmallInt',
      );
    }
  }
}

export { InvalidAnswerRelationshipError, InvalidAnswerShapeError };
