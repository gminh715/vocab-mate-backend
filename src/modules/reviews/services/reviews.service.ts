import {
  BadRequestException,
  ConflictException,
  Injectable,
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
  InvalidAnswerRelationshipError,
  InvalidAnswerShapeError,
  InvalidReviewSourceShapeError,
  NoUsableReviewQuestionError,
  ReviewConcurrencyConflictError,
  ReviewResourceNotFoundError,
  ReviewsRepository,
  ReviewSessionStateConflictError,
  ReviewSubmissionConflictError,
} from '../reviews.repository';
import { AiAssistedQuestionGeneratorService } from './ai-assisted-question-generator.service';
import {
  type AnswerDiagnosisDecisionRequest,
  ReviewAgentService,
  type SessionPlanDecisionRequest,
} from './review-agent.service';

@Injectable()
export class ReviewsService {
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
      const preparedAiQuestions = await this.aiQuestionGenerator.warmCache(
        userId,
        dto,
        now,
      );
      const result = await this.reviewsRepository.startSession(
        userId,
        dto,
        now,
        preparedAiQuestions,
      );
      if (!result) {
        throw new NotFoundException('No eligible vocabulary found');
      }
      return this.formatState(result);
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
      const result = await this.reviewsRepository.submitAnswer(
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

  getToday(userId: string, query: GetDueReviewsQueryDto) {
    return this.reviewsRepository.getDueRecommendations(
      userId,
      query,
      new Date(),
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
    };
  }
}
