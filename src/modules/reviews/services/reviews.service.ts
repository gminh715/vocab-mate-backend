import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  GetDueReviewsQueryDto,
  GetReviewHistoryQueryDto,
  SubmitReviewAnswerDto,
} from '../dto/review-request.dto';
import {
  ActiveReviewSessionConflictError,
  DuplicateReviewAnswerConflictError,
  IncompleteReviewSessionConflictError,
  InvalidAnswerRelationshipError,
  InvalidAnswerShapeError,
  ReviewConcurrencyConflictError,
  ReviewResourceNotFoundError,
  ReviewsRepository,
  ReviewSessionStateConflictError,
} from '../reviews.repository';

@Injectable()
export class ReviewsService {
  constructor(private readonly reviewsRepository: ReviewsRepository) {}

  async startQuizSession(userId: string, quizId: string) {
    try {
      const result = await this.reviewsRepository.startQuizSession(
        userId,
        quizId,
      );
      if (!result) throw new NotFoundException('Quiz not found');
      return result;
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
      ...(state.nextQuestion ? { nextQuestion: state.nextQuestion } : {}),
    };
  }

  async submitAnswer(
    userId: string,
    sessionId: string,
    dto: SubmitReviewAnswerDto,
  ) {
    try {
      return await this.reviewsRepository.submitAnswer(userId, sessionId, dto);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  async completeSession(userId: string, sessionId: string) {
    try {
      return await this.reviewsRepository.completeSession(userId, sessionId);
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

  getDue(userId: string, query: GetDueReviewsQueryDto) {
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
    if (
      error instanceof ActiveReviewSessionConflictError ||
      error instanceof DuplicateReviewAnswerConflictError ||
      error instanceof IncompleteReviewSessionConflictError ||
      error instanceof ReviewSessionStateConflictError ||
      error instanceof ReviewConcurrencyConflictError
    ) {
      throw new ConflictException('Review operation conflicts with its state');
    }
    throw error;
  }
}
