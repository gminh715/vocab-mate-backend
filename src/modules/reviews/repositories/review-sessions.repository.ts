import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  ArticleStatus,
  type CefrLevel,
  LearningStatus,
  QuestionGenerationSource,
  QuestionType,
  QuizStatus,
  ReviewAgentAction,
  ReviewDecisionKind,
  ReviewDecisionSource,
  type ReviewGoal,
  type ReviewErrorType,
  ReviewSessionItemStatus,
  ReviewSessionStatus,
  ReviewSessionType,
  ReviewSkillDimension,
} from '../../../../generated/prisma/enums';
import {
  REVIEW_QUESTION_PROMPT_VERSION,
  type DiagnoseReviewAnswerInput,
  type ReviewRetestAfterItems,
  type ReviewTargetDuration,
} from '../../ai/ai.contracts';
import { PrismaService } from '../../../database/prisma.service';
import type {
  GetDueReviewsQueryDto,
  GetReviewHistoryQueryDto,
  SkipReviewSessionItemDto,
  StartReviewSessionDto,
  SubmitReviewAnswerDto,
} from '../dto/review-request.dto';
import {
  AnswerGradingService,
  InvalidAnswerRelationshipError,
  InvalidAnswerShapeError,
  type GradingQuestion,
} from '../services/answer-grading.service';
import { InvisibleReviewScoringService } from '../services/invisible-review-scoring.service';
import {
  QuestionSelectionService,
  RECENT_ACCURACY_WINDOW,
  type RecentQuestionAttempt,
} from '../services/question-selection.service';

export class ReviewResourceNotFoundError extends Error {}
export class ReviewSessionStateConflictError extends Error {}
export class ReviewConcurrencyConflictError extends Error {}
export class InvalidReviewSourceShapeError extends Error {}
export class ReviewSubmissionConflictError extends Error {}
export class NoUsableReviewQuestionError extends Error {}
export class InvalidReviewAgentDecisionRelationshipError extends Error {}
export class ReviewAgentDecisionConflictError extends Error {}

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_RETRY_COUNT = 1;
const DEFAULT_RETEST_AFTER_ITEMS: ReviewRetestAfterItems = 3;
const DIAGNOSIS_SKILL_WINDOW_DAYS = 14;
const MAX_LEARNER_SNAPSHOT_VOCABULARIES = 100;
const REVIEW_ELIGIBLE_LEARNING_STATUSES = [
  LearningStatus.NEW,
  LearningStatus.LEARNING,
  LearningStatus.REVIEWING,
];
const REVIEW_SKILL_LABELS: Record<ReviewSkillDimension, string> = {
  [ReviewSkillDimension.RECOGNITION]: 'recognition',
  [ReviewSkillDimension.RECALL]: 'recall',
  [ReviewSkillDimension.SPELLING]: 'spelling',
  [ReviewSkillDimension.CONTEXT]: 'context',
  [ReviewSkillDimension.PRODUCTION]: 'production',
};

const reviewEligibilityWhere = (
  userId: string,
  now: Date,
  sourceWhere: Prisma.UserVocabularyWhereInput,
): Prisma.UserVocabularyWhereInput => ({
  userId,
  learningStatus: { in: REVIEW_ELIGIBLE_LEARNING_STATUSES },
  OR: [{ nextReviewAt: { lte: now } }, { nextReviewAt: null }],
  ...sourceWhere,
});

const reviewEligibilitySql = (userId: string, now: Date) => Prisma.sql`
  uv.user_id = ${userId}::uuid
  AND uv.learning_status IN (
    ${Prisma.join(
      REVIEW_ELIGIBLE_LEARNING_STATUSES.map(
        (status) => Prisma.sql`${status}::learning_status`,
      ),
    )}
  )
  AND (
    uv.next_review_at <= ${now}
    OR uv.next_review_at IS NULL
  )
`;

const sessionSelect = {
  id: true,
  sessionType: true,
  quizId: true,
  articleId: true,
  collectionId: true,
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
} satisfies Prisma.QuizQuestionSelect;

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
  questionType: QuestionType;
  preferredQuestionTypes: QuestionType[];
  cachedQuestion: PreparedAiReviewQuestion | null;
}

export interface VocabularyQuestionSnapshot {
  id: string;
  articleSentenceTermId: string;
  savedWordDisplay: string;
  savedLemma: string;
  savedPartOfSpeech: string;
  savedCefrLevel: CefrLevel;
  savedContextSentence: string;
  savedMeaningVi: string;
  savedExplanation: string | null;
  categoryId: string;
  articleTopic?: string;
}

export interface GeneratedAiQuestionSpec {
  quizId: null;
  articleSentenceTermId: string;
  questionType: QuestionType;
  generationSource: typeof QuestionGenerationSource.AI;
  generationVersion: string;
  difficultyCefr: CefrLevel;
  prompt: string;
  blankSentence: string | null;
  correctAnswerText: string | null;
  answerExplanation: string | null;
  isCaseSensitive: boolean;
  points: number;
  displayOrder: number;
  isActive: boolean;
  options: Array<{
    optionText: string;
    isCorrect: boolean;
    explanation: string | null;
    displayOrder: number;
  }>;
}

export interface PreparedAiReviewQuestion {
  userVocabularyId: string;
  quizQuestionId: string;
  articleSentenceTermId: string;
  difficultyCefr: CefrLevel;
  questionType: QuestionType;
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

export type ReviewAgentJsonValue =
  | string
  | number
  | boolean
  | null
  | ReviewAgentJsonValue[]
  | ReviewAgentJsonObject;

export interface ReviewAgentJsonObject {
  [key: string]: ReviewAgentJsonValue;
}

export interface PersistReviewAgentDecisionInput {
  reviewSessionId: string;
  reviewSessionItemId: string | null;
  reviewAnswerId: string | null;
  kind: ReviewDecisionKind;
  source: ReviewDecisionSource;
  action: ReviewAgentAction | null;
  skillDimension: ReviewSkillDimension | null;
  errorType: ReviewErrorType | null;
  confidence: number | null;
  reasonCode: string;
  stateSnapshot: ReviewAgentJsonObject;
  decisionPayload: ReviewAgentJsonObject;
  provider: string | null;
  model: string | null;
  promptVersion: string;
  latencyMs: number | null;
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

export interface ApplyAnswerAgentDecisionInput {
  decision: PersistReviewAgentDecisionInput;
  originalQuestionType: QuestionType;
  expectedAttemptNumber: number;
  preparedRetestQuestion: PreparedAiReviewQuestion | null;
}

export interface ApplySessionPlanDecisionInput {
  decision: PersistReviewAgentDecisionInput;
  targetDurationMinutes: ReviewTargetDuration;
  reviewGoal: ReviewGoal;
  plannedItemCount: number;
  planSummary: string;
  agentVersion: string;
  orderedSessionItemIds: string[];
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
    private readonly answerGradingService: AnswerGradingService,
    private readonly reviewScoringService: InvisibleReviewScoringService,
    private readonly questionSelectionService: QuestionSelectionService,
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
        {
          sessionType: ReviewSessionType.DAILY_REVIEW,
          limit: boundedLimit,
        },
        undefined,
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

  async reserveAiCallSlot(
    userId: string,
    sessionId: string,
    maximumCalls: number,
  ): Promise<boolean> {
    this.assertAiCallMaximum(maximumCalls, 'maximumCalls');
    const reservation = await this.prisma.reviewSession.updateMany({
      where: {
        id: sessionId,
        userId,
        status: ReviewSessionStatus.IN_PROGRESS,
        aiCallCount: { lt: maximumCalls },
      },
      data: { aiCallCount: { increment: 1 } },
    });
    return reservation.count === 1;
  }

  async reserveDiagnosisAiCallSlot(
    userId: string,
    sessionId: string,
    maximumCalls: number,
    maximumDiagnosisCalls: number,
  ): Promise<boolean> {
    this.assertAiCallMaximum(maximumCalls, 'maximumCalls');
    this.assertAiCallMaximum(maximumDiagnosisCalls, 'maximumDiagnosisCalls');
    const reservation = await this.prisma.reviewSession.updateMany({
      where: {
        id: sessionId,
        userId,
        status: ReviewSessionStatus.IN_PROGRESS,
        aiCallCount: { lt: maximumCalls },
        aiDiagnosisCallCount: { lt: maximumDiagnosisCalls },
      },
      data: {
        aiCallCount: { increment: 1 },
        aiDiagnosisCallCount: { increment: 1 },
      },
    });
    return reservation.count === 1;
  }

  async persistAgentDecision(
    userId: string,
    input: PersistReviewAgentDecisionInput,
  ) {
    const isAnswerDecision =
      input.kind === ReviewDecisionKind.ANSWER_INTERVENTION;
    if (
      (isAnswerDecision &&
        (!input.reviewSessionItemId || !input.reviewAnswerId)) ||
      (!isAnswerDecision &&
        (input.reviewSessionItemId !== null || input.reviewAnswerId !== null))
    ) {
      throw new InvalidReviewAgentDecisionRelationshipError();
    }
    try {
      const decision = await this.prisma.$transaction(async (tx) => {
        const session = await tx.reviewSession.findFirst({
          where: { id: input.reviewSessionId, userId },
          select: { id: true },
        });
        if (!session) throw new ReviewResourceNotFoundError();

        if (input.reviewSessionItemId) {
          const item = await tx.reviewSessionItem.findFirst({
            where: {
              id: input.reviewSessionItemId,
              reviewSessionId: input.reviewSessionId,
            },
            select: { id: true },
          });
          if (!item) {
            throw new InvalidReviewAgentDecisionRelationshipError();
          }
        }

        if (input.reviewAnswerId) {
          const answer = await tx.reviewAnswer.findFirst({
            where: {
              id: input.reviewAnswerId,
              reviewSessionItem: {
                is: {
                  reviewSessionId: input.reviewSessionId,
                  ...(input.reviewSessionItemId
                    ? { id: input.reviewSessionItemId }
                    : {}),
                },
              },
            },
            select: { id: true },
          });
          if (!answer) {
            throw new InvalidReviewAgentDecisionRelationshipError();
          }
        }

        return tx.reviewAgentDecision.create({
          data: input,
        });
      });
      return { decision, created: true } as const;
    } catch (error: unknown) {
      if (!input.reviewAnswerId || !this.hasPrismaCode(error, 'P2002')) {
        throw error;
      }
      const existing = await this.prisma.reviewAgentDecision.findFirst({
        where: {
          reviewAnswerId: input.reviewAnswerId,
          kind: input.kind,
          reviewSession: { is: { userId } },
        },
      });
      if (!existing) throw error;
      return { decision: existing, created: false } as const;
    }
  }

  async applySessionPlanDecision(
    userId: string,
    input: ApplySessionPlanDecisionInput,
  ) {
    const { decision } = input;
    const uniqueItemIds = new Set(input.orderedSessionItemIds);
    if (
      decision.kind !== ReviewDecisionKind.SESSION_PLAN ||
      decision.reviewSessionItemId !== null ||
      decision.reviewAnswerId !== null ||
      decision.action !== null ||
      decision.skillDimension !== null ||
      decision.errorType !== null ||
      ![5, 10, 15].includes(input.targetDurationMinutes) ||
      input.plannedItemCount !== input.orderedSessionItemIds.length ||
      input.plannedItemCount < 1 ||
      input.plannedItemCount > MAX_LEARNER_SNAPSHOT_VOCABULARIES ||
      uniqueItemIds.size !== input.orderedSessionItemIds.length ||
      input.planSummary.trim().length === 0 ||
      input.planSummary.length > 300 ||
      input.agentVersion.trim().length === 0 ||
      input.agentVersion.length > 50
    ) {
      throw new InvalidReviewAgentDecisionRelationshipError();
    }

    return this.withSerializableRetry(async (tx) => {
      const session = await tx.reviewSession.findFirst({
        where: {
          id: decision.reviewSessionId,
          userId,
          status: ReviewSessionStatus.IN_PROGRESS,
          planSummary: null,
        },
        select: sessionSelect,
      });
      if (!session) throw new ReviewAgentDecisionConflictError();

      const items = await tx.reviewSessionItem.findMany({
        where: {
          reviewSessionId: session.id,
          status: ReviewSessionItemStatus.PENDING,
        },
        orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
        select: { id: true, sequenceNumber: true },
      });
      if (
        items.length !== input.orderedSessionItemIds.length ||
        items.some(({ id }) => !uniqueItemIds.has(id))
      ) {
        throw new ReviewAgentDecisionConflictError();
      }

      const claimed = await tx.reviewSession.updateMany({
        where: {
          id: session.id,
          userId,
          status: ReviewSessionStatus.IN_PROGRESS,
          planSummary: null,
        },
        data: {
          targetDurationMinutes: input.targetDurationMinutes,
          reviewGoal: input.reviewGoal,
          plannedItemCount: input.plannedItemCount,
          planSummary: input.planSummary.trim(),
          agentVersion: input.agentVersion,
        },
      });
      if (claimed.count !== 1) throw new ReviewAgentDecisionConflictError();

      const orderChanged = input.orderedSessionItemIds.some(
        (itemId, index) => items[index]?.id !== itemId,
      );
      if (orderChanged) {
        const sequenceOffset = items.length + 1;
        await tx.reviewSessionItem.updateMany({
          where: { reviewSessionId: session.id },
          data: { sequenceNumber: { increment: sequenceOffset } },
        });
        for (const [index, itemId] of input.orderedSessionItemIds.entries()) {
          await tx.reviewSessionItem.update({
            where: { id: itemId },
            data: { sequenceNumber: index + 1 },
            select: { id: true },
          });
        }
      }

      await tx.reviewAgentDecision.create({ data: decision });
      const plannedSession = await tx.reviewSession.findFirst({
        where: { id: session.id, userId },
        select: sessionSelect,
      });
      if (!plannedSession) throw new ReviewAgentDecisionConflictError();
      return this.getSessionStateWithClient(tx, plannedSession);
    });
  }

  async applyAnswerAgentDecision(
    userId: string,
    input: ApplyAnswerAgentDecisionInput,
  ) {
    const { decision } = input;
    const retest = this.readRetestDecision(decision.decisionPayload);
    const hasRetestAction =
      decision.action === ReviewAgentAction.REQUEUE_WITH_NEW_TYPE ||
      decision.action === ReviewAgentAction.TEACH_AND_REQUEUE;
    if (
      decision.kind !== ReviewDecisionKind.ANSWER_INTERVENTION ||
      !decision.reviewSessionItemId ||
      !decision.reviewAnswerId ||
      !decision.action ||
      !decision.skillDimension ||
      !decision.errorType ||
      this.readAgentAction(decision.decisionPayload) !== decision.action ||
      (hasRetestAction
        ? !retest || retest.questionType === input.originalQuestionType
        : retest !== null || input.preparedRetestQuestion !== null)
    ) {
      throw new InvalidReviewAgentDecisionRelationshipError();
    }
    const reviewSessionItemId = decision.reviewSessionItemId;
    const reviewAnswerId = decision.reviewAnswerId;

    try {
      return await this.withSerializableRetry(async (tx) => {
        const session = await tx.reviewSession.findFirst({
          where: {
            id: decision.reviewSessionId,
            userId,
            status: ReviewSessionStatus.IN_PROGRESS,
          },
          select: sessionSelect,
        });
        if (!session) throw new ReviewAgentDecisionConflictError();

        const item = await tx.reviewSessionItem.findFirst({
          where: {
            id: reviewSessionItemId,
            reviewSessionId: session.id,
            status: ReviewSessionItemStatus.PENDING,
          },
          select: {
            id: true,
            userVocabularyId: true,
            retryCount: true,
            quizQuestion: {
              select: {
                id: true,
                articleSentenceTermId: true,
                questionType: true,
              },
            },
            userVocabulary: {
              select: { savedCefrLevel: true },
            },
          },
        });
        if (
          !item ||
          !item.userVocabularyId ||
          !item.userVocabulary ||
          item.retryCount !== input.expectedAttemptNumber
        ) {
          throw new ReviewAgentDecisionConflictError();
        }

        const answer = await tx.reviewAnswer.findFirst({
          where: {
            id: reviewAnswerId,
            reviewSessionItemId: item.id,
            attemptNumber: input.expectedAttemptNumber,
            isCorrect: false,
            quizQuestion: {
              is: { questionType: input.originalQuestionType },
            },
          },
          select: { id: true },
        });
        if (!answer) throw new ReviewAgentDecisionConflictError();

        let retestQuestionId: string | null = null;
        if (retest) {
          retestQuestionId = item.quizQuestion.id;
        }
        if (retest && item.quizQuestion.questionType !== retest.questionType) {
          const prepared = input.preparedRetestQuestion;
          if (
            !prepared ||
            prepared.userVocabularyId !== item.userVocabularyId ||
            prepared.articleSentenceTermId !==
              item.quizQuestion.articleSentenceTermId ||
            prepared.difficultyCefr !== item.userVocabulary.savedCefrLevel ||
            prepared.questionType !== retest.questionType
          ) {
            throw new ReviewAgentDecisionConflictError();
          }
          const preparedQuestion = await tx.quizQuestion.findFirst({
            where: {
              id: prepared.quizQuestionId,
              quizId: null,
              articleSentenceTermId: prepared.articleSentenceTermId,
              difficultyCefr: prepared.difficultyCefr,
              questionType: retest.questionType,
              generationSource: QuestionGenerationSource.AI,
              generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
              isActive: true,
            },
            select: { id: true },
          });
          if (!preparedQuestion) throw new ReviewAgentDecisionConflictError();
          retestQuestionId = preparedQuestion.id;
        }

        await tx.reviewAgentDecision.create({ data: decision });
        await tx.reviewAnswer.update({
          where: { id: answer.id },
          data: {
            skillDimension: decision.skillDimension,
            errorType: decision.errorType,
          },
          select: { id: true },
        });
        if (retestQuestionId && retestQuestionId !== item.quizQuestion.id) {
          await tx.reviewSessionItem.update({
            where: { id: item.id },
            data: { quizQuestionId: retestQuestionId },
            select: { id: true },
          });
        }
        if (retest) {
          await this.movePendingItemAfter(
            tx,
            session.id,
            item.id,
            retest.afterItems,
          );
        }
        const state = await this.getSessionStateWithClient(tx, session);
        return {
          ...state,
          agentFeedback: this.toAgentFeedback(decision),
        };
      });
    } catch (error: unknown) {
      if (this.hasPrismaCode(error, 'P2002')) {
        throw new ReviewAgentDecisionConflictError();
      }
      throw error;
    }
  }

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
      const cachedQuestions =
        vocabularies.length === 0
          ? []
          : await tx.quizQuestion.findMany({
              where: {
                quizId: null,
                articleSentenceTermId: {
                  in: vocabularies.map(
                    ({ articleSentenceTermId }) => articleSentenceTermId,
                  ),
                },
                generationSource: QuestionGenerationSource.AI,
                generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
                isActive: true,
              },
              orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
              select: {
                id: true,
                articleSentenceTermId: true,
                difficultyCefr: true,
                questionType: true,
              },
            });

      const preferences = vocabularies.map((vocabulary) =>
        this.questionSelectionService.preferredTypes(
          vocabulary,
          history.get(vocabulary.id) ?? [],
          undefined,
          dto.reviewGoal,
        ),
      );
      const selectedTypes = this.questionSelectionService.selectSessionTypes(
        preferences,
        dto.reviewGoal,
      );

      return vocabularies.map((vocabulary, index) => {
        const basePreferences = preferences[index];
        const selectedType = selectedTypes[index] ?? basePreferences[0];
        const preferredTypes = [
          selectedType,
          ...basePreferences.filter(
            (questionType) => questionType !== selectedType,
          ),
        ];
        const cached = cachedQuestions.find(
          (question) =>
            question.articleSentenceTermId ===
              vocabulary.articleSentenceTermId &&
            question.difficultyCefr === vocabulary.savedCefrLevel &&
            question.questionType === selectedType,
        );
        const cachedQuestion = cached
          ? this.toPreparedAiQuestion(vocabulary.id, cached)
          : null;
        return {
          vocabulary: this.toQuestionSnapshot(vocabulary),
          questionType: selectedType,
          preferredQuestionTypes: preferredTypes,
          cachedQuestion,
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
        generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
        isActive: true,
      },
      select: { id: true },
    });
  }

  async findPreferredCachedAiQuestion(
    userVocabularyId: string,
    articleSentenceTermId: string,
    difficultyCefr: ReviewVocabulary['savedCefrLevel'],
    preferredQuestionTypes: QuestionType[],
  ): Promise<PreparedAiReviewQuestion | null> {
    const cached = await this.prisma.quizQuestion.findMany({
      where: {
        quizId: null,
        articleSentenceTermId,
        difficultyCefr,
        questionType: { in: preferredQuestionTypes },
        generationSource: QuestionGenerationSource.AI,
        generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
        isActive: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        articleSentenceTermId: true,
        difficultyCefr: true,
        questionType: true,
      },
    });
    const selected = preferredQuestionTypes.flatMap((questionType) => {
      const match = cached.find(
        (question) => question.questionType === questionType,
      );
      return match ? [match] : [];
    })[0];
    return selected
      ? this.toPreparedAiQuestion(userVocabularyId, selected)
      : null;
  }

  async cacheAiQuestion(spec: GeneratedAiQuestionSpec) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cached = await tx.quizQuestion.findFirst({
          where: {
            quizId: null,
            articleSentenceTermId: spec.articleSentenceTermId,
            difficultyCefr: spec.difficultyCefr,
            questionType: spec.questionType,
            generationSource: QuestionGenerationSource.AI,
            generationVersion: spec.generationVersion,
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

  startSession(
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
    preparedAiQuestions: PreparedAiReviewQuestion[] = [],
    initialAiCallCount = 0,
  ) {
    this.assertInitialAiCallCount(initialAiCallCount);
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
        vocabularies,
        source.quizId,
        preparedAiQuestions,
        dto.reviewGoal,
      );
      if (assignedQuestions.length !== vocabularies.length) {
        throw new NoUsableReviewQuestionError();
      }

      const session = await tx.reviewSession.create({
        data: {
          userId,
          sessionType: dto.sessionType,
          quizId: source.quizId,
          articleId: source.articleId,
          collectionId: source.collectionId,
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
          quizQuestionId: question.id,
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
        quizQuestion: {
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
    } = activeItem.quizQuestion;
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
            skillDimension: this.questionSelectionService.skillDimensionFor(
              question.questionType,
            ),
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
      const wantsRetry =
        !grading.isCorrect && item.retryCount < MAX_RETRY_COUNT;
      const pendingItemsAfterCurrent = wantsRetry
        ? await tx.reviewSessionItem.findMany({
            where: {
              reviewSessionId: session.id,
              status: ReviewSessionItemStatus.PENDING,
              id: { not: item.id },
              sequenceNumber: { gt: item.sequenceNumber },
            },
            orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
            take: 5,
            select: { id: true, sequenceNumber: true },
          })
        : [];
      const recentAttemptSnapshots =
        wantsRetry && pendingItemsAfterCurrent.length >= 2 && vocabulary
          ? ((await this.loadRecentAttemptSnapshots(tx, [vocabulary])).get(
              vocabulary.id,
            ) ?? [])
          : [];
      const retryQuestion =
        wantsRetry && pendingItemsAfterCurrent.length >= 2
          ? await this.assignRetryQuestion(
              tx,
              vocabulary,
              question.questionType,
              session.quizId,
              recentAttemptSnapshots,
            )
          : null;
      const shouldRetry = retryQuestion !== null;
      const completed = grading.isCorrect || !shouldRetry;
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
              }
            : {}),
        },
        select: { id: true },
      });

      const fallbackRetestAfterItems = shouldRetry
        ? this.defaultRetestOffset(pendingItemsAfterCurrent.length)
        : null;
      if (fallbackRetestAfterItems !== null) {
        await this.movePendingItemAfter(
          tx,
          session.id,
          item.id,
          fallbackRetestAfterItems,
        );
      }

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
            !grading.isCorrect && item.retryCount === 0,
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

      const attemptNumber = item._count.answers + 1;
      const learnerAnswer =
        grading.selectedOptionId === null
          ? (dto.userAnswerText ?? '')
          : (question.options.find(({ id }) => id === grading.selectedOptionId)
              ?.optionText ?? '');
      const diagnosisSkillAggregates =
        !grading.isCorrect &&
        shouldRetry &&
        retryQuestion &&
        vocabulary &&
        fallbackRetestAfterItems !== null
          ? await this.loadSkillAggregates(
              tx,
              userId,
              now,
              DIAGNOSIS_SKILL_WINDOW_DAYS,
            )
          : [];
      const diagnosisSnapshot: PostAnswerDiagnosisSnapshot | undefined =
        !grading.isCorrect &&
        shouldRetry &&
        retryQuestion &&
        vocabulary &&
        fallbackRetestAfterItems !== null
          ? {
              request: {
                reviewSessionItemId: item.id,
                reviewAnswerId: answer.id,
                isCorrect: false,
                wasSkipped: false,
                lapseCount: vocabulary.lapseCount,
                input: {
                  targetCefr: vocabulary.savedCefrLevel,
                  wordOrPhrase: vocabulary.savedWordDisplay,
                  lemma: vocabulary.savedLemma,
                  partOfSpeech: vocabulary.savedPartOfSpeech,
                  contextualMeaningVi: vocabulary.savedMeaningVi,
                  originalSentence: vocabulary.savedContextSentence,
                  questionType: question.questionType,
                  learnerAnswer,
                  correctAnswer: grading.correctAnswer,
                  responseTimeMs: dto.responseTimeMs ?? 0,
                  hintsUsed: dto.hintsUsed ?? 0,
                  attemptNumber,
                  recentAttempts: recentAttemptSnapshots
                    .filter(({ answerId }) => answerId !== answer.id)
                    .map(
                      ({
                        questionType,
                        skillDimension,
                        isCorrect,
                        responseTimeMs,
                        hintsUsed,
                      }) => ({
                        questionType,
                        skillDimension,
                        isCorrect,
                        responseTimeMs: responseTimeMs ?? 0,
                        hintsUsed,
                      }),
                    ),
                  skillAggregates: diagnosisSkillAggregates.map(
                    ({
                      skillDimension,
                      attemptCount,
                      correctCount,
                      averageResponseTimeMs,
                    }) => ({
                      skillDimension,
                      attempts: attemptCount,
                      correct: correctCount,
                      averageResponseTimeMs: averageResponseTimeMs ?? 0,
                    }),
                  ),
                  allowedSkillDimensions: [
                    ReviewSkillDimension.RECOGNITION,
                    ReviewSkillDimension.RECALL,
                    ReviewSkillDimension.SPELLING,
                    ReviewSkillDimension.CONTEXT,
                  ],
                  allowedActions: [
                    ReviewAgentAction.CONTINUE,
                    ReviewAgentAction.REQUEUE_WITH_NEW_TYPE,
                    ReviewAgentAction.TEACH_AND_REQUEUE,
                    ReviewAgentAction.FLAG_FOR_FUTURE_FOCUS,
                  ],
                  allowedRetestQuestionTypes: [
                    retryQuestion.questionType,
                    ...Object.values(QuestionType).filter(
                      (candidate) =>
                        candidate !== question.questionType &&
                        candidate !== retryQuestion.questionType,
                    ),
                  ],
                  allowedRetestAfterItems: [2, 3, 4, 5].filter(
                    (offset): offset is ReviewRetestAfterItems =>
                      offset <= pendingItemsAfterCurrent.length,
                  ),
                },
              },
              vocabulary: this.toQuestionSnapshot(vocabulary),
              originalQuestionType: question.questionType,
              fallbackRetestQuestionType: retryQuestion.questionType,
              fallbackRetestAfterItems,
              attemptNumber,
            }
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
        ...(diagnosisSnapshot ? { diagnosisSnapshot } : {}),
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
            targetDurationMinutes: row.targetDurationMinutes,
            reviewGoal: row.reviewGoal,
            plannedItemCount: row.plannedItemCount,
            planSummary: row.planSummary,
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
            userVocabulary: {
              select: {
                id: true,
                savedWordDisplay: true,
                savedMeaningVi: true,
                savedExplanation: true,
              },
            },
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
              select: {
                selectedOptionId: true,
                userAnswerText: true,
                isCorrect: true,
                skillDimension: true,
                errorType: true,
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
      reviewAnswers: answers
        .slice(0, 1)
        .map(({ isCorrect }) => ({ isCorrect })),
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
          incorrectAnswer.quizQuestion.options.find(
            ({ id }) => id === incorrectAnswer.selectedOptionId,
          ) ?? null;
        return [
          {
            userVocabularyId: userVocabulary?.id ?? null,
            wordOrPhrase:
              userVocabulary?.savedWordDisplay ??
              this.answerGradingService.correctAnswer(
                incorrectAnswer.quizQuestion,
              ),
            meaningVi: userVocabulary?.savedMeaningVi ?? null,
            skillDimension: incorrectAnswer.skillDimension,
            errorType: incorrectAnswer.errorType,
            explanation:
              incorrectAnswer.quizQuestion.answerExplanation ??
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
      coachSummary: this.buildCoachSummary(skillBreakdown),
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

  private buildCoachSummary(
    breakdown: Array<{
      skillDimension: ReviewSkillDimension;
      attempts: number;
      correct: number;
      accuracy: number;
    }>,
  ) {
    const strengths = [...breakdown]
      .filter(({ accuracy }) => accuracy >= 0.75)
      .sort(
        (left, right) =>
          right.accuracy - left.accuracy || right.attempts - left.attempts,
      )
      .slice(0, 2)
      .map(({ skillDimension }) => skillDimension);
    const focusNext = [...breakdown]
      .filter(({ accuracy }) => accuracy < 0.75)
      .sort(
        (left, right) =>
          left.accuracy - right.accuracy || right.attempts - left.attempts,
      )
      .slice(0, 2)
      .map(({ skillDimension }) => skillDimension);
    const strengthLabels = strengths.map((skill) => REVIEW_SKILL_LABELS[skill]);
    const focusLabels = focusNext.map((skill) => REVIEW_SKILL_LABELS[skill]);
    const message =
      breakdown.length === 0
        ? 'Complete another review to build a clearer skill picture.'
        : focusLabels.length > 0 && strengthLabels.length > 0
          ? `You were strongest in ${strengthLabels.join(' and ')}. Focus next on ${focusLabels.join(' and ')}.`
          : focusLabels.length > 0
            ? `Focus next on ${focusLabels.join(' and ')} in a short follow-up review.`
            : `You showed reliable ${strengthLabels.join(' and ')}. Keep reinforcing it in context.`;
    return {
      strengths,
      focusNext,
      message,
      source: ReviewDecisionSource.RULE,
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
    const duePredicate = reviewEligibilitySql(userId, now);
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
    const hasUnexpectedDailyPlan =
      dto.sessionType !== ReviewSessionType.DAILY_REVIEW &&
      (dto.targetDurationMinutes != null || dto.reviewGoal != null);
    if (hasUnexpectedSource || missingSource || hasUnexpectedDailyPlan) {
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
    const commonWhere = reviewEligibilityWhere(userId, now, sourceWhere);
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
    vocabularies: ReviewVocabulary[],
    quizId: string | null,
    preparedAiQuestions: PreparedAiReviewQuestion[],
    reviewGoal?: ReviewGoal,
  ) {
    const history = await this.loadRecentAttemptHistory(tx, vocabularies);
    const preferences = vocabularies.map((vocabulary) => ({
      vocabulary,
      preferredTypes: this.questionSelectionService.preferredTypes(
        vocabulary,
        history.get(vocabulary.id) ?? [],
        undefined,
        reviewGoal,
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
        return { vocabulary, question: selected };
      });
    }

    if (preparedAiQuestions.length === 0) return [];
    const preparedByVocabularyId = new Map(
      preparedAiQuestions.map((question) => [
        question.userVocabularyId,
        question,
      ]),
    );
    const questions = await tx.quizQuestion.findMany({
      where: {
        id: {
          in: preparedAiQuestions.map(({ quizQuestionId }) => quizQuestionId),
        },
        quizId: null,
        generationSource: QuestionGenerationSource.AI,
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
          candidate.id === prepared.quizQuestionId &&
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
      throw new ReviewAgentDecisionConflictError();
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

  private async assignRetryQuestion(
    tx: Prisma.TransactionClient,
    vocabulary: ReviewVocabulary | null,
    previousType: QuestionType,
    quizId: string | null,
    recentAttempts: LearnerSnapshotAttempt[],
  ) {
    if (!vocabulary) throw new ReviewResourceNotFoundError();
    const preferredTypes = this.questionSelectionService.preferredTypes(
      vocabulary,
      recentAttempts.map(({ questionType, isCorrect }) => ({
        questionType,
        isCorrect,
      })),
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

    const cached = await tx.quizQuestion.findMany({
      where: {
        quizId: null,
        articleSentenceTermId: vocabulary.articleSentenceTermId,
        difficultyCefr: vocabulary.savedCefrLevel,
        questionType: { in: preferredTypes },
        generationSource: QuestionGenerationSource.AI,
        generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
        isActive: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: { id: true, articleSentenceTermId: true, questionType: true },
    });
    return this.selectExistingQuestion(cached, preferredTypes) ?? null;
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

  private toPreparedAiQuestion(
    userVocabularyId: string,
    question: {
      id: string;
      articleSentenceTermId: string;
      difficultyCefr: CefrLevel;
      questionType: QuestionType;
    },
  ): PreparedAiReviewQuestion {
    return {
      userVocabularyId,
      quizQuestionId: question.id,
      articleSentenceTermId: question.articleSentenceTermId,
      difficultyCefr: question.difficultyCefr,
      questionType: question.questionType,
    };
  }

  private async loadRecentAttemptHistory(
    tx: Prisma.TransactionClient,
    vocabularies: ReviewVocabulary[],
  ): Promise<Map<string, RecentQuestionAttempt[]>> {
    const snapshots = await this.loadRecentAttemptSnapshots(tx, vocabularies);
    const history = new Map<string, RecentQuestionAttempt[]>();
    for (const [userVocabularyId, attempts] of snapshots) {
      history.set(
        userVocabularyId,
        attempts.map(({ questionType, isCorrect }) => ({
          questionType,
          isCorrect,
        })),
      );
    }
    return history;
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
        JOIN quiz_questions question ON question.id = answer.quiz_question_id
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
          row.skillDimension ??
          this.questionSelectionService.skillDimensionFor(row.questionType),
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
                quizQuestion: { select: safeQuestionSelect },
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
            question: this.mapSafeQuestion(next.quizQuestion),
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

  private assertAiCallMaximum(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 1 || value > 32_767) {
      throw new RangeError(`${name} must be a positive SmallInt`);
    }
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
