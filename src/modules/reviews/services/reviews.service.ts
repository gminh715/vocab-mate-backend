import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  GetDueReviewsQueryDto,
  GetReviewHistoryQueryDto,
  SkipReviewSessionItemDto,
  StartReviewSessionDto,
  SubmitReviewAnswerDto,
} from '../dto/review-request.dto';
import {
  InvalidReviewAgentDecisionRelationshipError,
  InvalidAnswerRelationshipError,
  InvalidAnswerShapeError,
  InvalidReviewSourceShapeError,
  NoUsableReviewQuestionError,
  ReviewConcurrencyConflictError,
  ReviewAgentDecisionConflictError,
  ReviewResourceNotFoundError,
  ReviewsRepository,
  ReviewSessionStateConflictError,
  ReviewSubmissionConflictError,
  type PersistReviewAgentDecisionInput,
  type PostAnswerDiagnosisSnapshot,
  type PreparedAiReviewQuestion,
} from '../reviews.repository';
import {
  QuestionType,
  ReviewGoal,
  ReviewSessionType,
  ReviewSkillDimension,
} from '../../../../generated/prisma/enums';
import {
  AGENTIC_REVIEW_V1_SKILL_DIMENSIONS,
  REVIEW_TARGET_DURATIONS,
  type ReviewTargetDuration,
} from '../../ai/ai.contracts';
import { AiAssistedQuestionGeneratorService } from './ai-assisted-question-generator.service';
import {
  type AnswerDiagnosisDecisionRequest,
  ReviewAgentService,
  type SessionPlanDecisionRequest,
} from './review-agent.service';

const DEFAULT_DAILY_REVIEW_DURATION: ReviewTargetDuration = 10;
const DEFAULT_DAILY_REVIEW_LIMIT = 20;
const DAILY_REVIEW_GOALS = [
  ReviewGoal.BALANCED,
  ReviewGoal.RECALL,
  ReviewGoal.SPELLING,
  ReviewGoal.CONTEXT,
] as const;
const DEFAULT_REVIEW_ITEM_TIME_BY_GOAL_MS: Record<ReviewGoal, number> = {
  [ReviewGoal.BALANCED]: 45_000,
  [ReviewGoal.RECALL]: 40_000,
  [ReviewGoal.SPELLING]: 60_000,
  [ReviewGoal.CONTEXT]: 55_000,
};
const REVIEW_ITEM_TRANSITION_TIME_MS = 10_000;
const MIN_REVIEW_ITEM_TIME_MS = 30_000;
const MAX_REVIEW_ITEM_TIME_MS = 75_000;
const MIN_PERSONAL_TIMING_SAMPLE = 3;

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly aiQuestionGenerator: AiAssistedQuestionGeneratorService,
    private readonly reviewAgent: ReviewAgentService,
  ) {}

  async createSessionPlanDecision(request: SessionPlanDecisionRequest) {
    const decision = await this.reviewAgent.planSession(request);
    return this.reviewsRepository.persistAgentDecision(
      request.userId,
      decision,
    );
  }

  async createAnswerInterventionDecision(
    request: AnswerDiagnosisDecisionRequest,
  ) {
    const decision = await this.reviewAgent.diagnoseAnswer(request);
    return this.reviewsRepository.persistAgentDecision(
      request.userId,
      decision,
    );
  }

  async startSession(userId: string, dto: StartReviewSessionDto) {
    try {
      const now = new Date();
      const dailyPlan =
        dto.sessionType === ReviewSessionType.DAILY_REVIEW
          ? await this.buildDailyPlanSettings(userId, dto, now)
          : null;
      const effectiveDto = dailyPlan
        ? {
            ...dto,
            targetDurationMinutes: dailyPlan.targetDurationMinutes,
            reviewGoal: dailyPlan.reviewGoal,
            limit: dailyPlan.itemLimit,
          }
        : dto;
      let initialAiCallCount = 0;
      const preparedAiQuestions = await this.aiQuestionGenerator.warmCache(
        userId,
        effectiveDto,
        now,
        () => {
          initialAiCallCount += 1;
        },
      );
      const result = await this.reviewsRepository.startSession(
        userId,
        effectiveDto,
        now,
        preparedAiQuestions,
        initialAiCallCount,
      );
      if (!result) {
        throw new NotFoundException('No eligible vocabulary found');
      }
      let state = result;
      if (result.answeredCount === 0 && result.session.planSummary === null) {
        try {
          state =
            (await this.planNewSession(
              userId,
              result.session.id,
              now,
              dailyPlan?.reviewGoal ?? ReviewGoal.BALANCED,
              dailyPlan?.targetDurationMinutes ?? DEFAULT_DAILY_REVIEW_DURATION,
            )) ?? result;
        } catch {
          this.logger.warn(
            'Optional review session planning failed; continuing with the committed deterministic session',
          );
        }
      }
      return this.formatState(state);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  async getSession(userId: string, sessionId: string) {
    const state = await this.reviewsRepository.getSessionState(
      userId,
      sessionId,
    );
    if (!state) throw new NotFoundException('Review session not found');
    return this.formatState(state);
  }

  async getActiveSession(userId: string) {
    const state = await this.reviewsRepository.getActiveSessionState(userId);
    if (!state) throw new NotFoundException('Active review session not found');
    return this.formatState(state);
  }

  async submitAnswer(
    userId: string,
    sessionId: string,
    dto: SubmitReviewAnswerDto,
  ) {
    try {
      const initialResult = await this.reviewsRepository.submitAnswer(
        userId,
        sessionId,
        dto,
      );
      const { diagnosisSnapshot, ...committedResult } = initialResult;
      let result = committedResult;

      if (diagnosisSnapshot) {
        const decision = await this.reviewAgent.diagnoseAnswer({
          userId,
          reviewSessionId: sessionId,
          ...diagnosisSnapshot.request,
        });
        const requestedRetestType = this.readRetestQuestionType(decision);
        let preparedRetestQuestion: PreparedAiReviewQuestion | null = null;
        let applicableDecision = decision;
        if (
          requestedRetestType &&
          requestedRetestType !== diagnosisSnapshot.fallbackRetestQuestionType
        ) {
          preparedRetestQuestion =
            await this.aiQuestionGenerator.prepareRetestQuestion(
              userId,
              sessionId,
              diagnosisSnapshot.vocabulary,
              requestedRetestType,
            );
          if (!preparedRetestQuestion) {
            applicableDecision = this.useFallbackRetest(
              decision,
              diagnosisSnapshot,
            );
          }
        }

        try {
          const enhancedState =
            await this.reviewsRepository.applyAnswerAgentDecision(userId, {
              decision: applicableDecision,
              originalQuestionType: diagnosisSnapshot.originalQuestionType,
              expectedAttemptNumber: diagnosisSnapshot.attemptNumber,
              preparedRetestQuestion,
            });
          result = { ...committedResult, ...enhancedState };
        } catch (error: unknown) {
          if (
            !(error instanceof ReviewAgentDecisionConflictError) &&
            !(error instanceof InvalidReviewAgentDecisionRelationshipError) &&
            !(error instanceof ReviewConcurrencyConflictError)
          ) {
            throw error;
          }
        }
      }
      const { session, answeredCount, totalQuestions, nextItem, ...feedback } =
        result;
      const state = this.formatState({
        session,
        answeredCount,
        totalQuestions,
        nextItem,
      });
      return {
        ...feedback,
        progress: state.progress,
        ...(state.nextItem ? { nextQuestion: state.nextItem } : {}),
      };
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  private readRetestQuestionType(
    decision: PersistReviewAgentDecisionInput,
  ): QuestionType | null {
    const retest = decision.decisionPayload.retest;
    if (
      typeof retest !== 'object' ||
      retest === null ||
      Array.isArray(retest)
    ) {
      return null;
    }
    const questionType = retest.questionType;
    if (typeof questionType !== 'string') return null;
    return (
      Object.values(QuestionType).find(
        (candidate) => candidate === questionType,
      ) ?? null
    );
  }

  private useFallbackRetest(
    decision: PersistReviewAgentDecisionInput,
    snapshot: PostAnswerDiagnosisSnapshot,
  ): PersistReviewAgentDecisionInput {
    return {
      ...decision,
      decisionPayload: {
        ...decision.decisionPayload,
        retest: {
          questionType: snapshot.fallbackRetestQuestionType,
          afterItems: snapshot.fallbackRetestAfterItems,
        },
      },
    };
  }

  private async planNewSession(
    userId: string,
    reviewSessionId: string,
    now: Date,
    reviewGoal: ReviewGoal,
    targetDurationMinutes: ReviewTargetDuration,
  ) {
    const snapshot = await this.reviewsRepository.getSessionPlanningSnapshot(
      userId,
      reviewSessionId,
      now,
      14,
    );
    if (!snapshot || snapshot.candidates.length === 0) return null;

    const input = {
      targetCefr:
        snapshot.currentCefrLevel ??
        snapshot.candidates[0].vocabulary.savedCefrLevel,
      reviewGoal,
      targetDurationMinutes,
      maxItemCount: snapshot.candidates.length,
      allowedFocusDimensions: this.orderFocusDimensions(
        reviewGoal,
        snapshot.skillAggregates,
      ),
      candidates: snapshot.candidates.map(({ alias, vocabulary }) => ({
        alias,
        wordOrPhrase: vocabulary.savedWordDisplay,
        lemma: vocabulary.savedLemma,
        partOfSpeech: vocabulary.savedPartOfSpeech,
        contextualMeaningVi: vocabulary.savedMeaningVi,
        originalSentence: vocabulary.savedContextSentence,
        daysOverdue: Math.floor(
          vocabulary.overdueDurationMs / (24 * 60 * 60 * 1_000),
        ),
        lapseCount: vocabulary.lapseCount,
        recentAttempts: vocabulary.recentAttempts.map((attempt) => ({
          questionType: attempt.questionType,
          skillDimension: attempt.skillDimension,
          isCorrect: attempt.isCorrect,
          responseTimeMs: attempt.responseTimeMs ?? 0,
          hintsUsed: attempt.hintsUsed,
        })),
      })),
      skillAggregates: snapshot.skillAggregates.map((aggregate) => ({
        skillDimension: aggregate.skillDimension,
        attempts: aggregate.attemptCount,
        correct: aggregate.correctCount,
        averageResponseTimeMs: aggregate.averageResponseTimeMs ?? 0,
      })),
    };
    const decision = await this.reviewAgent.planSession({
      userId,
      reviewSessionId,
      input,
    });
    const candidatesByAlias = new Map(
      snapshot.candidates.map((candidate) => [candidate.alias, candidate]),
    );
    const requestedAliases = Array.isArray(
      decision.decisionPayload.orderedCandidateAliases,
    )
      ? decision.decisionPayload.orderedCandidateAliases
      : [];
    const orderedAliases: string[] = [];
    for (const alias of requestedAliases) {
      if (
        typeof alias === 'string' &&
        candidatesByAlias.has(alias) &&
        !orderedAliases.includes(alias)
      ) {
        orderedAliases.push(alias);
      }
    }
    for (const { alias } of snapshot.candidates) {
      if (!orderedAliases.includes(alias)) orderedAliases.push(alias);
    }
    const summary = decision.decisionPayload.summary;
    if (typeof summary !== 'string') {
      throw new InvalidReviewAgentDecisionRelationshipError();
    }

    return this.reviewsRepository.applySessionPlanDecision(userId, {
      decision,
      targetDurationMinutes: input.targetDurationMinutes,
      reviewGoal: input.reviewGoal,
      plannedItemCount: orderedAliases.length,
      planSummary: summary,
      agentVersion: decision.promptVersion,
      orderedSessionItemIds: orderedAliases.map(
        (alias) => candidatesByAlias.get(alias)!.reviewSessionItemId,
      ),
    });
  }

  async skipItem(
    userId: string,
    sessionId: string,
    dto: SkipReviewSessionItemDto,
  ) {
    try {
      const result = await this.reviewsRepository.skipItem(
        userId,
        sessionId,
        dto,
      );
      const { session, answeredCount, totalQuestions, nextItem, ...feedback } =
        result;
      const state = this.formatState({
        session,
        answeredCount,
        totalQuestions,
        nextItem,
      });
      return {
        ...feedback,
        progress: state.progress,
        ...(state.nextItem ? { nextQuestion: state.nextItem } : {}),
      };
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  async abandonSession(userId: string, sessionId: string) {
    try {
      return await this.reviewsRepository.abandonSession(userId, sessionId);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  async getHistory(userId: string, query: GetReviewHistoryQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }
    const { from: _fromInput, to: _toInput, ...historyQuery } = query;
    void _fromInput;
    void _toInput;
    const result = await this.reviewsRepository.listHistory(userId, {
      ...historyQuery,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    return {
      items: result.items,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async getResult(userId: string, sessionId: string) {
    try {
      const result = await this.reviewsRepository.getCompletedResult(
        userId,
        sessionId,
      );
      if (!result) throw new NotFoundException('Review session not found');
      return result;
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  getSummary(userId: string, sessionId: string) {
    return this.getResult(userId, sessionId);
  }

  async getToday(userId: string, query: GetDueReviewsQueryDto) {
    const now = new Date();
    const [recommendations, goalTimings] = await Promise.all([
      this.reviewsRepository.getDueRecommendations(userId, query, now),
      Promise.all(
        DAILY_REVIEW_GOALS.map((reviewGoal) =>
          this.reviewsRepository.getRecentReviewTimingStats(
            userId,
            now,
            this.skillDimensionForGoal(reviewGoal),
          ),
        ),
      ),
    ]);
    return {
      ...recommendations,
      dailyReviewEstimates: REVIEW_TARGET_DURATIONS.map(
        (targetDurationMinutes) => {
          const goalEstimates = DAILY_REVIEW_GOALS.map((reviewGoal, index) => ({
            reviewGoal,
            estimatedItemCount: Math.min(
              recommendations.dueVocabularyCount,
              this.itemCountForDuration(
                targetDurationMinutes,
                this.estimatedItemTimeMs(goalTimings[index], reviewGoal),
                DEFAULT_DAILY_REVIEW_LIMIT,
              ),
            ),
          }));
          return {
            targetDurationMinutes,
            estimatedItemCount: goalEstimates[0].estimatedItemCount,
            goalEstimates,
          };
        },
      ),
    };
  }

  private async buildDailyPlanSettings(
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
  ) {
    const targetDurationMinutes =
      dto.targetDurationMinutes ?? DEFAULT_DAILY_REVIEW_DURATION;
    const reviewGoal = dto.reviewGoal ?? ReviewGoal.BALANCED;
    const timing = await this.reviewsRepository.getRecentReviewTimingStats(
      userId,
      now,
      this.skillDimensionForGoal(reviewGoal),
    );
    return {
      targetDurationMinutes,
      reviewGoal,
      itemLimit: this.itemCountForDuration(
        targetDurationMinutes,
        this.estimatedItemTimeMs(timing, reviewGoal),
        dto.limit ?? DEFAULT_DAILY_REVIEW_LIMIT,
      ),
    };
  }

  private estimatedItemTimeMs(
    timing: {
      attemptCount: number;
      averageResponseTimeMs: number | null;
    },
    reviewGoal: ReviewGoal,
  ): number {
    if (
      timing.attemptCount < MIN_PERSONAL_TIMING_SAMPLE ||
      timing.averageResponseTimeMs === null
    ) {
      return DEFAULT_REVIEW_ITEM_TIME_BY_GOAL_MS[reviewGoal];
    }
    return Math.min(
      Math.max(
        Math.round(timing.averageResponseTimeMs) +
          REVIEW_ITEM_TRANSITION_TIME_MS,
        MIN_REVIEW_ITEM_TIME_MS,
      ),
      MAX_REVIEW_ITEM_TIME_MS,
    );
  }

  private skillDimensionForGoal(
    reviewGoal: ReviewGoal,
  ): ReviewSkillDimension | undefined {
    switch (reviewGoal) {
      case ReviewGoal.RECALL:
        return ReviewSkillDimension.RECALL;
      case ReviewGoal.SPELLING:
        return ReviewSkillDimension.SPELLING;
      case ReviewGoal.CONTEXT:
        return ReviewSkillDimension.CONTEXT;
      case ReviewGoal.BALANCED:
        return undefined;
    }
  }

  private itemCountForDuration(
    targetDurationMinutes: ReviewTargetDuration,
    estimatedItemTimeMs: number,
    requestedLimit: number,
  ): number {
    return Math.max(
      1,
      Math.min(
        requestedLimit,
        Math.floor((targetDurationMinutes * 60_000) / estimatedItemTimeMs),
      ),
    );
  }

  private orderFocusDimensions(
    reviewGoal: ReviewGoal,
    aggregates: Array<{
      skillDimension: ReviewSkillDimension;
      attemptCount: number;
      accuracy: number;
      averageResponseTimeMs: number | null;
    }>,
  ): ReviewSkillDimension[] {
    const goalDimension =
      reviewGoal === ReviewGoal.RECALL
        ? ReviewSkillDimension.RECALL
        : reviewGoal === ReviewGoal.SPELLING
          ? ReviewSkillDimension.SPELLING
          : reviewGoal === ReviewGoal.CONTEXT
            ? ReviewSkillDimension.CONTEXT
            : null;
    const evidenceOrder = [...aggregates]
      .sort(
        (left, right) =>
          left.accuracy - right.accuracy ||
          (right.averageResponseTimeMs ?? 0) -
            (left.averageResponseTimeMs ?? 0) ||
          right.attemptCount - left.attemptCount ||
          left.skillDimension.localeCompare(right.skillDimension),
      )
      .map(({ skillDimension }) => skillDimension);
    return [
      ...(goalDimension ? [goalDimension] : []),
      ...evidenceOrder,
      ...AGENTIC_REVIEW_V1_SKILL_DIMENSIONS,
    ].filter(
      (dimension, index, dimensions) => dimensions.indexOf(dimension) === index,
    );
  }

  private mapError(error: unknown): never {
    if (
      error instanceof ReviewResourceNotFoundError ||
      error instanceof InvalidAnswerRelationshipError
    ) {
      throw new NotFoundException('Review resource not found');
    }
    if (error instanceof InvalidAnswerShapeError) {
      throw new BadRequestException(error.message);
    }
    if (error instanceof InvalidReviewSourceShapeError) {
      throw new BadRequestException(
        'Review session source does not match its type',
      );
    }
    if (error instanceof NoUsableReviewQuestionError) {
      throw new ServiceUnavailableException(
        'Review questions are temporarily unavailable; retry later',
      );
    }
    if (
      error instanceof ReviewSessionStateConflictError ||
      error instanceof ReviewSubmissionConflictError ||
      error instanceof ReviewConcurrencyConflictError
    ) {
      throw new ConflictException('Review operation conflicts with its state');
    }
    throw error;
  }

  private formatState<
    T extends {
      session: unknown;
      answeredCount: number;
      totalQuestions: number;
      nextItem?: unknown;
      agentFeedback?: unknown;
    },
  >(state: T) {
    const remainingCount = Math.max(
      state.totalQuestions - state.answeredCount,
      0,
    );
    return {
      session: state.session,
      progress: {
        answeredCount: state.answeredCount,
        totalQuestions: state.totalQuestions,
        remainingCount,
        progressPercent:
          state.totalQuestions === 0
            ? 0
            : Math.round(
                (state.answeredCount / state.totalQuestions) * 100 * 100,
              ) / 100,
      },
      ...(state.nextItem ? { nextItem: state.nextItem } : {}),
      ...(state.agentFeedback ? { agentFeedback: state.agentFeedback } : {}),
    };
  }
}
