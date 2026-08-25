import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  GetReviewHistoryQueryDto,
  SkipReviewSessionItemDto,
  StartReviewSessionDto,
  SubmitReviewAnswerDto,
} from '../dto/review-request.dto';
import {
  InvalidAnswerRelationshipError,
  InvalidAnswerShapeError,
  NoUsableReviewQuestionError,
  ReviewConcurrencyConflictError,
  ReviewResourceNotFoundError,
  ReviewSessionsRepository,
  ReviewSessionStateConflictError,
  ReviewSubmissionConflictError,
  type PostAnswerDiagnosisSnapshot,
} from '../repositories/review-sessions.repository';
import {
  InvalidReviewAgentDecisionRelationshipError,
  ReviewAgentDecisionConflictError,
  type PersistReviewAgentDecisionInput,
} from '../repositories/review-agent.repository';
import type { PreparedAiReviewQuestion } from '../repositories/review-questions.repository';
import { ReviewAnswerTransactionService } from './review-answer-transaction.service';
import { QuestionType } from '../../../../generated/prisma/enums';
import { AiAssistedQuestionGeneratorService } from './ai-assisted-question-generator.service';
import {
  type AnswerDiagnosisDecisionRequest,
  ReviewAgentService,
  type SessionPlanDecisionRequest,
} from './review-agent.service';
import { ReviewPreparationProgressService } from './review-preparation-progress.service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviewsRepository: ReviewSessionsRepository,
    private readonly answerTransactions: ReviewAnswerTransactionService,
    private readonly aiQuestionGenerator: AiAssistedQuestionGeneratorService,
    private readonly reviewAgent: ReviewAgentService,
    private readonly preparationProgress: ReviewPreparationProgressService,
  ) {}

  async createSessionPlanDecision(request: SessionPlanDecisionRequest) {
    return this.reviewAgent.persistSessionPlan(request);
  }

  async createAnswerInterventionDecision(
    request: AnswerDiagnosisDecisionRequest,
  ) {
    return this.reviewAgent.persistAnswerIntervention(request);
  }

  async startSession(userId: string, dto: StartReviewSessionDto) {
    const preparationId = dto.preparationId;
    if (preparationId) {
      this.preparationProgress.begin(userId, preparationId);
    }
    try {
      const now = new Date();
      const dueVocabularyCount = (
        await this.reviewsRepository.getDueRecommendations(userId, now)
      ).dueVocabularyCount;
      const effectiveDto = {
        ...dto,
        limit: Math.max(dueVocabularyCount, 1),
      };
      let initialAiCallCount = 0;
      if (preparationId) {
        this.preparationProgress.update(userId, preparationId, {
          stage: 'CHECKING_CACHE',
          progressPercent: 8,
        });
      }
      const preparedAiQuestions = await this.aiQuestionGenerator.warmCache(
        userId,
        effectiveDto,
        now,
        () => {
          initialAiCallCount += 1;
        },
        ({ completedItems, totalItems }) => {
          if (!preparationId) return;
          const generationProgress =
            totalItems === 0
              ? 80
              : 10 + Math.round((completedItems / totalItems) * 70);
          this.preparationProgress.update(userId, preparationId, {
            stage: totalItems === 0 ? 'CHECKING_CACHE' : 'GENERATING_QUESTIONS',
            progressPercent: generationProgress,
            completedItems,
            totalItems,
          });
        },
      );
      if (preparationId) {
        this.preparationProgress.update(userId, preparationId, {
          stage: 'CREATING_SESSION',
          progressPercent: 85,
        });
      }
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
      if (preparationId) {
        this.preparationProgress.complete(userId, preparationId);
      }
      return this.formatState(result);
    } catch (error: unknown) {
      if (preparationId) {
        this.preparationProgress.fail(userId, preparationId);
      }
      this.mapError(error);
    }
  }

  getPreparationProgress(userId: string, preparationId: string) {
    const progress = this.preparationProgress.get(userId, preparationId);
    if (!progress) {
      throw new NotFoundException('Review preparation not found');
    }
    return progress;
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

  async revealHint(
    userId: string,
    sessionId: string,
    reviewSessionItemId: string,
    hintIndex: number,
  ) {
    try {
      return await this.reviewsRepository.revealFillBlankHint(
        userId,
        sessionId,
        reviewSessionItemId,
        hintIndex,
      );
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  async submitAnswer(
    userId: string,
    sessionId: string,
    dto: SubmitReviewAnswerDto,
  ) {
    try {
      const initialResult = await this.answerTransactions.submit(
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
          const enhancedState = await this.reviewAgent.applyAnswerDecision(
            userId,
            {
              decision: applicableDecision,
              originalQuestionType: diagnosisSnapshot.originalQuestionType,
              expectedAttemptNumber: diagnosisSnapshot.attemptNumber,
              preparedRetestQuestion,
            },
          );
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

  async skipItem(
    userId: string,
    sessionId: string,
    dto: SkipReviewSessionItemDto,
  ) {
    try {
      const result = await this.answerTransactions.skip(userId, sessionId, dto);
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

  async getToday(userId: string) {
    const now = new Date();
    return this.reviewsRepository.getDueRecommendations(userId, now);
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
